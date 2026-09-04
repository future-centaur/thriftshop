import { db, ws, json, error } from "@appdeploy/sdk";

const SUBSCRIPTIONS_TABLE = "entity_subscriptions";
export type SubscriptionRecord = { id:string; entity_type:string; entity_id:string; connection_id:string; created_at:number };
async function listSubscriptions(): Promise<SubscriptionRecord[]> { const {items}=await db.list(SUBSCRIPTIONS_TABLE,{limit:1000}); return items as SubscriptionRecord[]; }
export async function removeSubscriptionsByConnection(connectionId:string){const items=await listSubscriptions();const ids=items.filter(x=>x.connection_id===connectionId).map(x=>x.id);if(ids.length)await db.delete(SUBSCRIPTIONS_TABLE,ids)}
export async function addSubscription(entityType:string,entityId:string,connectionId:string){await db.add(SUBSCRIPTIONS_TABLE,[{entity_type:entityType,entity_id:entityId,connection_id:connectionId,created_at:Date.now()}])}
export async function removeSubscriptions(entityType:string,entityId:string,connectionId:string){const items=await listSubscriptions();const ids=items.filter(x=>x.entity_type===entityType&&x.entity_id===entityId&&x.connection_id===connectionId).map(x=>x.id);if(ids.length)await db.delete(SUBSCRIPTIONS_TABLE,ids)}
export async function notifySubscribers(entityType:string,entityId:string,payload:unknown,excludeConnectionId?:string){const items=await listSubscriptions();const targets=Array.from(new Set(items.filter(x=>x.entity_type===entityType&&x.entity_id===entityId).map(x=>x.connection_id).filter(id=>id!==excludeConnectionId)));if(!targets.length)return;await ws.send(targets,{v:1,type:"entity.update",payload:{entity_type:entityType,entity_id:entityId,data:payload}})}
export const realtimeSubscriptionRoutes={
 "POST /api/subscriptions":[async({body})=>{const {entity_type,entity_id,connection_id}=(body||{}) as Record<string,string>;if(!entity_type||!entity_id||!connection_id)return error("entity_type, entity_id, connection_id are required");await addSubscription(entity_type,entity_id,connection_id);return json({ok:true})}],
 "POST /api/subscriptions/remove":[async({body})=>{const {entity_type,entity_id,connection_id}=(body||{}) as Record<string,string>;if(!entity_type||!entity_id||!connection_id)return error("entity_type, entity_id, connection_id are required");await removeSubscriptions(entity_type,entity_id,connection_id);return json({ok:true})}],
};
