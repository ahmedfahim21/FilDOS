/**
 * The Assistant's file tools: functions the chat model can call to act on the
 * user's files (node-llama-cpp function calling). This file is the shared
 * contract — the LLM worker turns each definition into a session function
 * (the schema constrains generation, so params always match it), and the main
 * process executes the named tool against fs/service.
 *
 * Safety model: everything a tool does is recoverable. Deletes go to the OS
 * Trash, creations and copies auto-rename on collision (" copy" suffixing) and
 * never overwrite, and there is no shell/exec surface. Paths may be absolute
 * or relative to the folder open in the browser (resolved by the executor).
 */

/** A GBNF-JSON-schema-shaped parameter description (node-llama-cpp subset). */
export interface ChatToolParams {
  type: 'object';
  properties: Record<string, unknown>;
}

export interface ChatToolDef {
  name: string;
  description: string;
  params: ChatToolParams;
}

/** A path that may be omitted (null → the folder open in the browser). */
const optionalFolder = (description: string) => ({
  oneOf: [{ type: 'null' }, { type: 'string' }],
  description,
});

export const CHAT_TOOLS: ChatToolDef[] = [
  {
    name: 'create_file',
    description:
      'Create a new text file with the given content. Never overwrites: a taken name gets a " copy" suffix.',
    params: {
      type: 'object',
      properties: {
        folder: optionalFolder(
          'Folder to create the file in (absolute, or relative to the current folder). null = the current folder.',
        ),
        name: { type: 'string', description: 'File name including extension, e.g. "notes.md".' },
        content: { type: 'string', description: 'The full text content of the file.' },
      },
    },
  },
  {
    name: 'create_folder',
    description: 'Create a new folder.',
    params: {
      type: 'object',
      properties: {
        folder: optionalFolder('Parent folder. null = the current folder.'),
        name: { type: 'string', description: 'Name of the new folder.' },
      },
    },
  },
  {
    name: 'copy_files',
    description: 'Copy files or folders into a destination folder. Collisions are auto-renamed.',
    params: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'The files/folders to copy.' },
        destination: { type: 'string', description: 'The folder to copy them into.' },
      },
    },
  },
  {
    name: 'move_files',
    description: 'Move files or folders into a destination folder. Collisions are auto-renamed.',
    params: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'The files/folders to move.' },
        destination: { type: 'string', description: 'The folder to move them into.' },
      },
    },
  },
  {
    name: 'rename_file',
    description: 'Rename a file or folder in place.',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file or folder to rename.' },
        new_name: { type: 'string', description: 'The new name (no path separators).' },
      },
    },
  },
  {
    name: 'delete_files',
    description:
      'Move files or folders to the OS Trash / Recycle Bin (recoverable there). Only when the user explicitly asks to delete.',
    params: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'The files/folders to delete.' },
      },
    },
  },
  {
    name: 'list_folder',
    description: 'List the files and folders inside a folder.',
    params: {
      type: 'object',
      properties: {
        path: optionalFolder('The folder to list. null = the current folder.'),
      },
    },
  },
  {
    name: 'read_file',
    description: 'Read the text content of a file (truncated when long).',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file to read.' },
      },
    },
  },
];
