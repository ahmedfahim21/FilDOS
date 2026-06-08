from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import torch
from PIL import Image
from sentence_transformers import SentenceTransformer, util
from transformers import CLIPProcessor, CLIPModel
import pdfplumber
from docx import Document
import pickle
import tempfile
import requests
from datetime import datetime
import io
from urllib.parse import urlparse
import weaviate
from weaviate.classes.init import Auth
from weaviate.classes.query import MetadataQuery
import numpy as np

# Suppress tokenizers warning
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Create Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
TEMP_FOLDER = 'temp_files'
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size

# Create directories
os.makedirs(TEMP_FOLDER, exist_ok=True)

app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Weaviate Configuration
WEAVIATE_URL = os.environ.get('WEAVIATE_URL', 'http://localhost:8080')
WEAVIATE_API_KEY = os.environ.get('WEAVIATE_API_KEY', None)

# Initialize Weaviate client
try:
    if WEAVIATE_API_KEY:
        weaviate_client = weaviate.connect_to_weaviate_cloud(
            cluster_url=WEAVIATE_URL,
            auth_credentials=Auth.api_key(WEAVIATE_API_KEY)
        )
    else:
        # Parse host and port from URL for local connection
        parsed_url = urlparse(WEAVIATE_URL)
        host = parsed_url.hostname or 'localhost'
        port = parsed_url.port or 8080
        weaviate_client = weaviate.connect_to_local(
            host=host,
            port=port
        )
    print("Connected to Weaviate successfully")
except Exception as e:
    print(f"Error connecting to Weaviate: {e}")
    weaviate_client = None

# Allowed file extensions
ALLOWED_EXTENSIONS = {
    'image': {'jpg', 'jpeg', 'png', 'bmp', 'webp'},
    'text': {'pdf', 'docx', 'txt', 'md'}
}

def is_allowed_file_type(filename):
    """Check if file extension is allowed"""
    if not filename:
        return False
    
    # Remove any query parameters or fragments
    filename = filename.split('?')[0].split('#')[0]
    
    if '.' not in filename:
        return False
    
    ext = filename.rsplit('.', 1)[1].lower()
    all_extensions = set()
    for extensions in ALLOWED_EXTENSIONS.values():
        all_extensions.update(extensions)
    
    print(f"Checking file type for '{filename}', extension: '{ext}', allowed: {ext in all_extensions}")
    return ext in all_extensions

# Initialize AI models
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# Model cache directory
MODEL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

# Load CLIP for images
clip_cache_dir = os.path.join(MODEL_CACHE_DIR, "clip-vit-base-patch32")
print("Loading CLIP model...")
try:
    clip_model = CLIPModel.from_pretrained(
        "openai/clip-vit-base-patch32",
        cache_dir=clip_cache_dir
    ).to(device)
    clip_processor = CLIPProcessor.from_pretrained(
        "openai/clip-vit-base-patch32",
        cache_dir=clip_cache_dir,
        use_fast=True
    )
    print("CLIP model loaded successfully")
except Exception as e:
    print(f"Error loading CLIP model: {e}")
    raise

# Load Sentence-BERT for text
sbert_cache_dir = os.path.join(MODEL_CACHE_DIR, "all-MiniLM-L6-v2")
print("Loading SentenceTransformer model...")
try:
    text_model = SentenceTransformer(
        "all-MiniLM-L6-v2",
        cache_folder=sbert_cache_dir
    ).to(device)
    print("SentenceTransformer model loaded successfully")
except Exception as e:
    print(f"Error loading SentenceTransformer model: {e}")
    raise

print("All models loaded successfully!")

def create_weaviate_collection(collection_name):
    """Create a Weaviate collection for storing embeddings"""
    try:
        
        if weaviate_client and not weaviate_client.collections.exists(collection_name):
            from weaviate.classes.config import Property, DataType, Configure
            
            weaviate_client.collections.create(
                name=collection_name,
                properties=[
                    Property(name="filename", data_type=DataType.TEXT),
                    Property(name="url", data_type=DataType.TEXT),
                    Property(name="type", data_type=DataType.TEXT),
                    Property(name="text_preview", data_type=DataType.TEXT),
                    Property(name="timestamp", data_type=DataType.TEXT),
                ],
                # Use named vectors to support different dimensions
                vectorizer_config=[
                    Configure.NamedVectors.none(
                        name="image_vector",
                        vector_index_config=Configure.VectorIndex.hnsw()
                    ),
                    Configure.NamedVectors.none(
                        name="text_vector",
                        vector_index_config=Configure.VectorIndex.hnsw()
                    )
                ]
            )
            print(f"Created Weaviate collection: {collection_name}")
        return collection_name
    except Exception as e:
        print(f"Error creating Weaviate collection: {e}")
        return None

# Helper functions
def download_file_from_url(url, temp_dir):
    """Download file from URL and save to temp directory"""
    try:
        # Add https:// if no scheme is present
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        print(f"Downloading file from URL: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # Get filename from URL or use a default
        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path)
        
        # Try to get filename from Content-Disposition header first
        content_disposition = response.headers.get('Content-Disposition', '')
        if 'filename=' in content_disposition:
            # Handle both simple and UTF-8 encoded filenames
            if 'filename*=' in content_disposition:
                # Extract UTF-8 encoded filename
                parts = content_disposition.split("filename*=UTF-8''")
                if len(parts) > 1:
                    filename = parts[1].strip()
            else:
                filename = content_disposition.split('filename=')[1].strip('"')
        
        # If we still don't have a good filename, create one
        if not filename or not is_allowed_file_type(filename):
            # Try to detect file type from content-type
            content_type = response.headers.get('Content-Type', '')
            if 'image' in content_type:
                if 'png' in content_type:
                    ext = 'png'
                elif 'jpeg' in content_type or 'jpg' in content_type:
                    ext = 'jpg'
                else:
                    ext = 'png'  # default
            elif 'pdf' in content_type:
                ext = 'pdf'
            elif 'text' in content_type:
                ext = 'txt'
            else:
                ext = 'bin'
            
            # Use the CID from URL as filename
            url_parts = url.split('/')
            if len(url_parts) > 0:
                cid = url_parts[-1]
                filename = f"{cid}.{ext}"
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"file_{timestamp}.{ext}"
        
        filepath = os.path.join(temp_dir, filename)
        print(f"Saving file as: {filename}")
        
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        print(f"Successfully downloaded: {filename}")
        return filepath, filename
    except Exception as e:
        print(f"Error downloading file from {url}: {e}")
        return None, None

def extract_text(file_path):
    """Extract text from various file formats"""
    ext = file_path.lower().split(".")[-1]
    try:
        if ext == "pdf":
            with pdfplumber.open(file_path) as pdf:
                return "\n".join(page.extract_text() or '' for page in pdf.pages)
        elif ext == "docx":
            doc = Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs)
        elif ext in {"txt", "md"}:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        else:
            return None
    except Exception as e:
        print(f"Error extracting text from {file_path}: {e}")
        return None

def embed_and_store_file(file_path, file_url, collection_name):
    """Create embeddings for a file and store in Weaviate"""
    ext = file_path.lower().split(".")[-1]
    filename = os.path.basename(file_path)
    timestamp = datetime.now().isoformat()

    try:
        collection = weaviate_client.collections.get(collection_name)
        
        # Check if file with this URL already exists
        existing = collection.query.fetch_objects(
            filters=weaviate.classes.query.Filter.by_property("url").equal(file_url),
            limit=1
        )
        
        if existing.objects:
            print(f"File already exists in collection, skipping: {filename}")
            return "skipped"
        
        if ext in {"jpg", "jpeg", "png", "bmp", "webp"}:
            # Image Embedding using CLIP
            image = Image.open(file_path).convert("RGB")
            inputs = clip_processor(images=image, return_tensors="pt").to(device)
            with torch.no_grad():
                image_emb = clip_model.get_image_features(**inputs)
            image_emb = image_emb / image_emb.norm(p=2)
            
            # Store in Weaviate with named vector
            collection.data.insert(
                properties={
                    "filename": filename,
                    "url": file_url,
                    "type": "image",
                    "text_preview": "",
                    "timestamp": timestamp
                },
                vector={
                    "image_vector": image_emb.cpu().numpy().flatten().tolist(),
                    "text_vector": [0] * 384  # Dummy text vector
                }
            )
            print(f"Image embedded and stored: {filename}")
            return True

        elif ext in {"pdf", "docx", "txt", "md"}:
            # Text Embedding using BERT
            text = extract_text(file_path)
            if text:
                text_emb = text_model.encode(text, convert_to_tensor=True)
                
                # Store in Weaviate with named vector
                collection.data.insert(
                    properties={
                        "filename": filename,
                        "url": file_url,
                        "type": "text",
                        "text_preview": text[:1000],
                        "timestamp": timestamp
                    },
                    vector={
                        "image_vector": [0] * 512,  # Dummy image vector
                        "text_vector": text_emb.cpu().numpy().flatten().tolist()
                    }
                )
                print(f"Text embedded and stored: {filename}")
                return True
            else:
                print(f"Could not extract text: {filename}")
                return False
        else:
            print(f"Unsupported file type: {filename}")
            return False
    except Exception as e:
        print(f"Error embedding file {filename}: {e}")
        return False

def search_weaviate(query, collection_name, top_k=5):
    """Search through Weaviate collection for relevant files"""
    try:
        collection = weaviate_client.collections.get(collection_name)
        
        # Process query for both image and text
        clip_inputs = clip_processor(text=query, return_tensors="pt").to(device)
        with torch.no_grad():
            query_emb_img = clip_model.get_text_features(**clip_inputs)
        query_emb_img = query_emb_img / query_emb_img.norm(p=2)
        
        query_emb_txt = text_model.encode(query, convert_to_tensor=True)
        
        # Search with image embeddings (for image files)
        results_img = collection.query.near_vector(
            near_vector=query_emb_img.cpu().numpy().flatten().tolist(),
            target_vector="image_vector",
            limit=top_k,
            return_metadata=MetadataQuery(distance=True),
            filters=weaviate.classes.query.Filter.by_property("type").equal("image")
        )
        
        # Search with text embeddings (for text files)
        results_txt = collection.query.near_vector(
            near_vector=query_emb_txt.cpu().numpy().flatten().tolist(),
            target_vector="text_vector",
            limit=top_k,
            return_metadata=MetadataQuery(distance=True),
            filters=weaviate.classes.query.Filter.by_property("type").equal("text")
        )
        
        # Combine and sort results
        all_results = []
        for result in results_img.objects:
            score = 1 - result.metadata.distance  # Convert distance to similarity
            all_results.append({
                "score": score,
                "type": result.properties["type"],
                "filename": result.properties["filename"],
                "url": result.properties["url"],
                "excerpt": result.properties.get("text_preview", "")
            })
        
        for result in results_txt.objects:
            score = 1 - result.metadata.distance
            # Check if already in results
            if not any(r["url"] == result.properties["url"] for r in all_results):
                all_results.append({
                    "score": score,
                    "type": result.properties["type"],
                    "filename": result.properties["filename"],
                    "url": result.properties["url"],
                    "excerpt": result.properties.get("text_preview", "")
                })
        
        # Sort by score and return top_k
        all_results.sort(key=lambda x: x["score"], reverse=True)
        return all_results[:top_k]
        
    except Exception as e:
        print(f"Error searching Weaviate: {e}")
        return []

@app.route('/embed', methods=['POST'])
def embed_endpoint():
    """Embed multiple files from URLs and store in Weaviate"""
    try:
        if not weaviate_client:
            return jsonify({'error': 'Weaviate client not initialized'}), 500
        
        # Handle both JSON and form data
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
            # Handle multiple URLs in form data
            if 'file_urls' in request.form:
                data['file_urls'] = request.form.getlist('file_urls')

        print(f"Received data: {data}")
        
        if not data:
            return jsonify({'error': 'JSON data or form data required'}), 400
        
        file_urls = data.get('file_urls', [])
        collection_name = data.get('collection_name', 'FileEmbeddings')
        
        # Handle single file_url for backward compatibility
        if not file_urls and data.get('file_url'):
            file_urls = [data.get('file_url')]
        
        if not file_urls:
            return jsonify({'error': 'file_urls array is required'}), 400
        
        # Create collection if it doesn't exist
        collection_name = create_weaviate_collection(collection_name)
        if not collection_name:
            return jsonify({'error': 'Failed to create collection'}), 500
        
        # Create temp directory for this request
        with tempfile.TemporaryDirectory() as temp_dir:
            processed_files = []
            failed_files = []
            skipped_files = []
            
            # Process each file URL
            for i, file_url in enumerate(file_urls):
                print(f"Processing file {i+1}/{len(file_urls)}: {file_url}")
                try:
                    # Download the file to embed
                    file_path, filename = download_file_from_url(file_url, temp_dir)
                    if not file_path:
                        print(f"Failed to download file {i+1}: {file_url}")
                        failed_files.append({
                            'url': file_url,
                            'error': 'Failed to download file from URL'
                        })
                        continue
                    
                    # Check if file type is allowed
                    if not is_allowed_file_type(filename):
                        print(f"File type not supported for {filename}")
                        failed_files.append({
                            'url': file_url,
                            'error': 'File type not supported'
                        })
                        continue
                    
                    # Embed and store the file
                    print(f"Embedding file: {filename}")
                    result = embed_and_store_file(file_path, file_url, collection_name)
                    if result == "skipped":
                        skipped_files.append({
                            'url': file_url,
                            'filename': filename,
                            'reason': 'File already exists in collection'
                        })
                        print(f"Skipped existing file {filename}")
                    elif result:
                        processed_files.append({
                            'url': file_url,
                            'filename': filename,
                            'status': 'success'
                        })
                        print(f"Successfully processed {filename}")
                    else:
                        failed_files.append({
                            'url': file_url,
                            'error': 'Failed to embed file'
                        })
                    
                except Exception as e:
                    print(f"Error processing file {i+1}: {e}")
                    failed_files.append({
                        'url': file_url,
                        'error': str(e)
                    })
            
            print(f"Processing complete: {len(processed_files)} successful, {len(skipped_files)} skipped, {len(failed_files)} failed")
            
            return jsonify({
                'collection_name': collection_name,
                'processed_files': processed_files,
                'skipped_files': skipped_files,
                'failed_files': failed_files,
                'total_processed': len(processed_files),
                'total_skipped': len(skipped_files),
                'total_failed': len(failed_files)
            })
            
    except Exception as e:
        return jsonify({'error': f'Error embedding files: {str(e)}'}), 500

@app.route('/search', methods=['POST'])
def search_endpoint():
    """Search through Weaviate collection and return file URLs"""
    try:
        if not weaviate_client:
            return jsonify({'error': 'Weaviate client not initialized'}), 500
        
        # Handle both JSON and form data
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        if not data:
            return jsonify({'error': 'JSON data or form data required'}), 400
        
        query = data.get('query')
        collection_name = data.get('collection_name', 'FileEmbeddings')
        top_k = int(data.get('top_k', 5))

        if not query:
            return jsonify({'error': 'query is required'}), 400
        
        # Search Weaviate
        results = search_weaviate(query, collection_name, top_k)

        print(f"Search completed. Found {len(results)} results for query: '{query}'")
        
        return jsonify({
            'query': query,
            'collection_name': collection_name,
            'results': results,
            'total_results': len(results)
        })
        
    except Exception as e:
        return jsonify({'error': f'Error searching: {str(e)}'}), 500

@app.route('/collections', methods=['GET'])
def list_collections():
    """List all Weaviate collections"""
    try:
        if not weaviate_client:
            return jsonify({'error': 'Weaviate client not initialized'}), 500
        
        # Get all collections - list_all() returns a dict with collection names as keys
        all_collections = weaviate_client.collections.list_all()
        
        # Extract collection names
        if isinstance(all_collections, dict):
            collections = list(all_collections.keys())
        else:
            # Fallback: try to get names if it's an iterable of objects
            collections = [col if isinstance(col, str) else col.name for col in all_collections]
        
        return jsonify({
            'collections': collections,
            'total': len(collections)
        })
    except Exception as e:
        return jsonify({'error': f'Error listing collections: {str(e)}'}), 500

@app.route('/collections/<collection_name>', methods=['GET', 'DELETE'])
def manage_collection(collection_name):
    """Get details or delete a Weaviate collection"""
    try:
        if not weaviate_client:
            return jsonify({'error': 'Weaviate client not initialized'}), 500
        
        if request.method == 'GET':
            # Get collection details
            if not weaviate_client.collections.exists(collection_name):
                return jsonify({'error': f'Collection {collection_name} not found'}), 404

            collection = weaviate_client.collections.get(collection_name)
            # Get object count
            response = collection.aggregate.over_all(total_count=True)
            count = response.total_count if response else 0
            
            return jsonify({
                'name': collection_name,
                'count': count,
                'exists': True
            })
        
        elif request.method == 'DELETE':
            # Delete collection
            weaviate_client.collections.delete(collection_name)
            return jsonify({
                'message': f'Collection {collection_name} deleted successfully'
            })
    except Exception as e:
        return jsonify({'error': f'Error managing collection: {str(e)}'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    weaviate_status = weaviate_client.is_ready() if weaviate_client else False
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'models_loaded': True,
        'weaviate_connected': weaviate_status
    })

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({'error': 'File too large. Maximum size is 16MB'}), 413

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Run the app
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )