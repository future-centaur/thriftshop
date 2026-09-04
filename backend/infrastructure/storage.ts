import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ObjectStorage {
    write(items: Array<{ path: string; content: string; contentType: string }>): Promise<boolean[]>;
    read(paths: string[]): Promise<Array<{ path: string; content: string | null }>>;
    url(paths: string[]): Promise<Array<{ path: string; url: string }>>;
    list(options?: { prefix?: string; nextToken?: string; limit?: number }): Promise<{ paths: string[]; nextToken?: string }>;
    delete(paths: string[]): Promise<boolean[]>;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

let cachedClient: S3Client | null = null;
function getClient(): S3Client {
    if (cachedClient) return cachedClient;
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials are not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
    }
    cachedClient = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });
    return cachedClient;
}

function getBucket(): string {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) {
        throw new Error('R2_BUCKET_NAME is not configured.');
    }
    return bucket;
}

function decodeBase64(content: string): Buffer {
    return Buffer.from(content, 'base64');
}

function isBase64(s: string): boolean {
    // Heuristic: a base64 string contains only alphanumerics + / + = and is at least 4 chars long
    if (!s || s.length < 4) return false;
    if (s.startsWith('data:')) return true;
    return /^[A-Za-z0-9+/=]+$/.test(s);
}

export const objectStorage: ObjectStorage = {
    async write(items: Array<{ path: string; content: string; contentType: string }>): Promise<boolean[]> {
        const client = getClient();
        const bucket = getBucket();
        const results: boolean[] = [];
        for (const item of items) {
            try {
                const body = isBase64(item.content)
                    ? decodeBase64(item.content.includes(',') ? item.content.split(',')[1] : item.content)
                    : Buffer.from(item.content, 'utf-8');
                await client.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: item.path,
                    Body: body,
                    ContentType: item.contentType,
                }));
                results.push(true);
            } catch (e) {
                console.error(`objectStorage.write failed for ${item.path}:`, e);
                results.push(false);
            }
        }
        return results;
    },

    async read(paths: string[]): Promise<Array<{ path: string; content: string | null }>> {
        const client = getClient();
        const bucket = getBucket();
        const results: Array<{ path: string; content: string | null }> = [];
        for (const path of paths) {
            try {
                const response = await client.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: path,
                }));
                const chunks: Uint8Array[] = [];
                const body = response.Body as any;
                if (body && typeof body[Symbol.asyncIterator] === 'function') {
                    for await (const chunk of body) {
                        chunks.push(chunk as Uint8Array);
                    }
                } else if (body) {
                    const buf = await body.transformToByteArray();
                    chunks.push(buf);
                }
                const combined = Buffer.concat(chunks);
                results.push({ path, content: combined.toString('base64') });
            } catch (e) {
                console.error(`objectStorage.read failed for ${path}:`, e);
                results.push({ path, content: null });
            }
        }
        return results;
    },

    async url(paths: string[]): Promise<Array<{ path: string; url: string }>> {
        const client = getClient();
        const bucket = getBucket();
        const results: Array<{ path: string; url: string }> = [];
        for (const path of paths) {
            try {
                const command = new GetObjectCommand({
                    Bucket: bucket,
                    Key: path,
                });
                const url = await getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
                results.push({ path, url });
            } catch (e) {
                console.error(`objectStorage.url failed for ${path}:`, e);
                results.push({ path, url: '' });
            }
        }
        return results;
    },

    async list(options?: { prefix?: string; nextToken?: string; limit?: number }): Promise<{ paths: string[]; nextToken?: string }> {
        // Listing not currently used by the application; return empty list
        return { paths: [], nextToken: undefined };
    },

    async delete(paths: string[]): Promise<boolean[]> {
        if (!paths.length) return [];
        const client = getClient();
        const bucket = getBucket();
        const results: boolean[] = [];
        for (const path of paths) {
            try {
                await client.send(new DeleteObjectCommand({
                    Bucket: bucket,
                    Key: path,
                }));
                results.push(true);
            } catch (e) {
                console.error(`objectStorage.delete failed for ${path}:`, e);
                results.push(false);
            }
        }
        return results;
    },
};
