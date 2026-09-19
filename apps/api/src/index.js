import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {loadEnvironment,logger} from '../../../packages/shared/src/index.js';

const env=loadEnvironment(),app=express(),allowed=env.PRESENCE_ALLOWED_ORIGINS.split(',').map(x=>x.trim()).filter(Boolean),presenceCache=new Map();
app.use(helmet());
app.use(cors({origin:(origin,cb)=>!origin||allowed.includes(origin)?cb(null,true):cb(new Error('CORS origin not allowed'))}));
app.use(express.json({limit:'100kb'}));
app.use('/api',rateLimit({windowMs:60000,max:120,standardHeaders:true,legacyHeaders:false}));
const valid=id=>/^\d{17,20}$/.test(String(id));
app.get('/health',(_,res)=>res.json({ok:true,service:'codek-hub-presence',timestamp:new Date().toISOString()}));
app.get('/api/discord/user/:userId',(req,res)=>{if(!valid(req.params.userId))return res.status(400).json({ok:false,error:'Invalid Discord user ID.'});const p=presenceCache.get(req.params.userId);return res.json({ok:true,data:p?{userId:p.userId,username:p.username??null,displayName:p.displayName??null,avatar:p.avatar??null}:null});});
app.get('/api/discord/presence/:userId',(req,res)=>{if(!valid(req.params.userId))return res.status(400).json({ok:false,error:'Invalid Discord user ID.'});return res.json({ok:true,data:presenceCache.get(req.params.userId)??null});});
app.post('/api/discord/presence',(req,res)=>{const p=req.body??{};if(!valid(p.userId))return res.status(400).json({ok:false,error:'Invalid userId.'});const value={...p,userId:String(p.userId),updatedAt:new Date().toISOString()};presenceCache.set(value.userId,value);return res.json({ok:true,data:value});});
app.use((err,_,res,__)=>(logger.warn('API error',{error:err.message}),res.status(500).json({ok:false,error:'Internal server error.'})));
app.listen(env.PORT,'0.0.0.0',()=>logger.info('Presence API started',{port:env.PORT}));