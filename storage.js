import pg from 'pg';
export const columns = ['date','time','temperature','humidity','pressure','heatIndex','currentRainfall','rainfallMinute','rainfallHour','rainfallDay','probability','heatProbability','deltaTemperature30min','deltaHumidity30min','rainStatus','heatStatus'];
export function normalizeReading(input) {
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
   return d;
}
export async function openStore(connectionString, suppliedPool) {
 const pool=suppliedPool || new pg.Pool({connectionString,max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:20000});
 pool.on('error',error=>console.error('Database connection:',error.message));
 await pool.query(`CREATE TABLE IF NOT EXISTS readings (
 device TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, payload JSONB NOT NULL,
 PRIMARY KEY(device,date,time))`);
 return {
  async put(input){const d=normalizeReading(input);const result=await pool.query(
   'INSERT INTO readings(device,date,time,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(device,date,time) DO NOTHING RETURNING device',
   [d.deviceId,d.date,d.time,JSON.stringify(d)]);return result.rows.length>0;},
  async dates(device){const result=await pool.query('SELECT date,COUNT(*) AS count FROM readings WHERE device=$1 GROUP BY date ORDER BY date DESC',[device]);return result.rows.map(row=>({...row,count:Number(row.count)}));},
  async rows(device,date){const result=await pool.query('SELECT payload FROM readings WHERE device=$1 AND date=$2 ORDER BY time',[device,date]);return result.rows.map(row=>row.payload);},
  async close(){await pool.end();}
 };
}
export function dailyCsv(rows){
 const cell=v=>{let s=String(v??'');if(/^[=+@\t\r]/.test(s)||/^-\D/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
}
