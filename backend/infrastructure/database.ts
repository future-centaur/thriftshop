import { db as appDeployDb } from '@appdeploy/sdk';

export interface Database { add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>>; get<T = Record<string, any>>(table: string, ids: string[]): Promise<Array<T | null>>; list<T = Record<string, any>>(table: string, options?: { filter?: Record<string, unknown>; nextToken?: string; limit?: number }): Promise<{ items: Array<Omit<T, 'id'> & { id: string }>; nextToken?: string }>; update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>): Promise<boolean[]>; delete(table: string, ids: string[]): Promise<boolean[]>; }

export const database: Database = appDeployDb;
