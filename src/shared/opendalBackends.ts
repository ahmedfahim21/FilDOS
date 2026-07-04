/**
 * Catalog of storage backends served through Apache OpenDAL. Shared between the
 * main process (which builds an `Operator` per account and registers a provider
 * per backend) and the renderer (which renders the connect form).
 *
 * Each backend's `id` doubles as the URI scheme (`s3://accountId/path`) and the
 * `accounts.provider` value. `scheme` is the OpenDAL service name, which may
 * differ (e.g. the "ipfs" backend uses OpenDAL's read-write `ipmfs` service).
 *
 * Dependency-free so it can be imported from any layer.
 */

/** One credential/config input rendered in the connect form. */
export interface BackendField {
  /** OpenDAL option key (snake_case), e.g. 'access_key_id'. */
  key: string;
  label: string;
  placeholder?: string;
  /** Optional helper text shown under the input. */
  help?: string;
  /** Empty values for optional fields are dropped before building the Operator. */
  optional?: boolean;
  /** Render as a password input and never echo back. */
  secret?: boolean;
}

export interface OpenDalBackend {
  /** URI scheme + accounts.provider value, e.g. 's3'. */
  id: string;
  /** OpenDAL service name, e.g. 's3', 'onedrive', 'ipmfs'. */
  scheme: string;
  name: string;
  /** How an account is connected: a credential form, or an OAuth loopback flow. */
  auth: 'config' | 'oauth';
  /** Whether this backend is usable with the bundled OpenDAL binary. */
  available: boolean;
  /** Why it's unavailable (shown in the UI), when `available` is false. */
  unavailableReason?: string;
  /** Config fields for the connect form (config auth only). */
  fields?: BackendField[];
}

export const OPENDAL_BACKENDS: OpenDalBackend[] = [
  {
    id: 's3',
    scheme: 's3',
    name: 'Amazon S3',
    auth: 'config',
    available: true,
    fields: [
      { key: 'bucket', label: 'Bucket' },
      { key: 'region', label: 'Region', placeholder: 'us-east-1' },
      { key: 'endpoint', label: 'Endpoint', placeholder: 'https://s3.amazonaws.com', optional: true },
      { key: 'access_key_id', label: 'Access Key ID', secret: true },
      { key: 'secret_access_key', label: 'Secret Access Key', secret: true },
      { key: 'root', label: 'Root path', placeholder: '/', optional: true },
    ],
  },
  {
    id: 'ipfs',
    scheme: 'ipmfs',
    name: 'IPFS',
    auth: 'config',
    available: true,
    fields: [
      {
        key: 'endpoint',
        label: 'Kubo RPC API endpoint',
        placeholder: 'http://127.0.0.1:5001',
        help: 'A write-capable IPFS node’s RPC API (e.g. a local Kubo node). Public gateways like ipfs.io are read-only and will not work.',
      },
      { key: 'root', label: 'Root path (MFS)', placeholder: '/', optional: true },
    ],
  },
  {
    id: 'onedrive',
    scheme: 'onedrive',
    name: 'OneDrive',
    auth: 'oauth',
    available: true,
  },
];

/** Look up a backend descriptor by id/scheme. */
export function findBackend(id: string): OpenDalBackend | undefined {
  return OPENDAL_BACKENDS.find((b) => b.id === id);
}
