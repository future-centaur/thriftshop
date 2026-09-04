import { storage as appDeployStorage } from '@appdeploy/sdk';

export interface ObjectStorage { write(items: Array<{ path: string; content: string; contentType: string }>): Promise<boolean[]>; read(paths: string[]): Promise<Array<{ path: string; content: string | null }>>; url(paths: string[]): Promise<Array<{ path: string; url: string }>>; list(options?: { prefix?: string; nextToken?: string; limit?: number }): Promise<{ paths: string[]; nextToken?: string }>; delete(paths: string[]): Promise<boolean[]>; }

export const objectStorage: ObjectStorage = appDeployStorage;
