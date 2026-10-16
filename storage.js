import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
export const columns = ['date','time','temperature','humidity','pressure','heatIndex','currentRainfall','rainfallMinute','rainfallHour','rainfallDay','probability','heatProbability','deltaTemperature30min','deltaHumidity30min','rainStatus','heatStatus'];
export function openStore(dir) {
 mkdirSync(dir,{recursive:true});
 const db=new DatabaseSync(join(dir,'weather.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS readings(device TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(device,date,time));`);
 const insert=db.prepare('INSERT OR IGNORE INTO readings VALUES (?,?,?,?)');
 return {
  put(input){
   const d={...input};
   if(typeof d.deviceId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(d.deviceId))throw Error('Invalid deviceId');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')||!/^\d{2}:\d{2}:\d{2}$/.test(d.time||''))throw Error('Invalid date/time');
   const check=new Date(d.date+'T'+d.time+'Z');
   if(!Number.isFinite(check.getTime())||check.toISOString().slice(0,19)!==d.date+'T'+d.time)throw Error('Invalid calendar date/time');
   if(Number(d.date.slice(0,4))<2020||Number(d.date.slice(0,4))>2099)throw Error('RTC year invalid');
   for(const k of columns.slice(2,14)){
    if(d[k]===null||d[k]===undefined){d[k]=null;continue;}
    if(typeof d[k]!=='number'||!Number.isFinite(d[k]))throw Error('Invalid '+k);
   }
   if(d.temperature===null||d.humidity===null)throw Error('Missing sensor measurements');
   for(const k of ['rainStatus','heatStatus'])d[k]=String(d[k]||'').slice(0,80);
   return Number(insert.run(d.deviceId,d.date,d.time,JSON.stringify(d)).changes)>0;
  },
  dates(device){return db.prepare('SELECT date,COUNT(*) AS count FROM readings WHERE device=? GROUP BY date ORDER BY date DESC').all(device);},
  rows(device,date){return db.prepare('SELECT payload FROM readings WHERE device=? AND date=? ORDER BY time').all(device,date).map(r=>JSON.parse(r.payload));},
  close(){db.close();}
 };
}
export function dailyCsv(rows){
 const cell=v=>{let s=String(v??'');if(/^[=+@\t\r]/.test(s)||/^-\D/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
}
