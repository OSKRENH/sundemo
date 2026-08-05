(() => {
  const SITE={latitude:55.7047,longitude:37.5709,timezone:3,northOnPlan:315};
  const SEASONS={winter:{label:'Зимнее солнце',date:'2026-12-21'},shoulder:{label:'Весна / осень',date:'2026-03-21'},summer:{label:'Летнее солнце',date:'2026-06-21'}};
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const degToRad=v=>v*Math.PI/180;
  const radToDeg=v=>v*180/Math.PI;
  const normalize=v=>{const l=Math.hypot(v[0],v[1])||1;return[v[0]/l,v[1]/l]};
  const dayOfYear=date=>{const start=new Date(Date.UTC(date.getUTCFullYear(),0,0));return Math.floor((date-start)/86400000)};
  function dateForSeason(season){const [y,m,d]=SEASONS[season].date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12))}
  function solarPosition(date,minutes){
    const day=dayOfYear(date),hour=minutes/60,gamma=2*Math.PI/365*(day-1+(hour-12)/24);
    const equationOfTime=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
    const declination=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
    const offset=equationOfTime+4*SITE.longitude-60*SITE.timezone;
    let solarTime=minutes+offset;while(solarTime<0)solarTime+=1440;while(solarTime>=1440)solarTime-=1440;
    let hourAngle=solarTime/4-180;if(hourAngle<-180)hourAngle+=360;
    const lat=degToRad(SITE.latitude),ha=degToRad(hourAngle);
    const cosZenith=clamp(Math.sin(lat)*Math.sin(declination)+Math.cos(lat)*Math.cos(declination)*Math.cos(ha),-1,1);
    const altitude=90-radToDeg(Math.acos(cosZenith));
    const azimuth=(radToDeg(Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(lat)-Math.tan(declination)*Math.cos(lat)))+540)%360;
    return{altitude,azimuth};
  }
  function planDirection(azimuth){const angle=degToRad(SITE.northOnPlan+azimuth);return normalize([Math.sin(angle),-Math.cos(angle)])}
  function directionLabel(a){const values=['север','северо-восток','восток','юго-восток','юг','юго-запад','запад','северо-запад'];return values[Math.round(a/45)%8]}
  function formatTime(minutes){const v=minutes%1440,h=Math.floor(v/60)%24,m=v%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
  window.SunMath={SITE,SEASONS,clamp,degToRad,normalize,dateForSeason,solarPosition,planDirection,directionLabel,formatTime};
})();
