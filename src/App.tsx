import {useEffect,useState} from 'react';
import {api} from '@appdeploy/client';
export default function App(){const[data,setData]=useState<any>(null);useEffect(()=>{api.get('/api/bootstrap').then(r=>setData(r.data))},[]);if(!data)return <main style={{padding:40}}>Loading AliBeka…</main>;return <main style={{padding:40,fontFamily:'system-ui'}}><h1>AliBeka</h1><p>Thrift & Accessories</p><p>{data.items.length} pieces · {data.bales.length} bales</p></main>}
