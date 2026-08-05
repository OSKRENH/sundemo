(() => {
  const HEIGHT=116,CENTER=[401,242];
  const OUTER=[[12,30],[735,30],[770,52],[790,100],[790,410],[340,410],[340,470],[275,410],[12,410]];
  const WALLS=[
    [[12,30],[42,30],18,1],[[226,30],[288,30],18,1],[[474,30],[536,30],18,1],[[720,30],[735,30],18,1],[[735,30],[770,52],18,1],[[770,52],[790,100],18,1],[[790,100],[790,208],18,1],[[790,386],[790,410],18,1],[[790,410],[340,410],18,1],[[340,410],[340,470],18,1],[[340,470],[275,410],18,1],[[275,410],[12,410],18,1],[[12,410],[12,30],18,1],
    [[266,30],[266,225],10,0],[[266,245],[266,410],10,0],[[12,243],[180,243],10,0],[[180,243],[180,410],10,0],[[340,243],[510,243],10,0],[[380,243],[380,410],10,0],[[510,243],[510,410],10,0],[[340,410],[340,282],10,0],[[275,410],[275,302],10,0]
  ].map(([a,b,thickness,outer])=>({a,b,thickness,outer:Boolean(outer)}));
  const WINDOWS=[[[42,30],[226,30],[0,1],[1,0]],[[288,30],[474,30],[0,1],[1,0]],[[536,30],[720,30],[0,1],[1,0]],[[790,208],[790,386],[-1,0],[0,1]]].map(([a,b,inward,tangent])=>({a,b,inward,tangent}));
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],mul=(v,n)=>[v[0]*n,v[1]*n],mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],perp=v=>[-v[1],v[0]];
  const norm=v=>{const l=Math.hypot(v[0],v[1])||1;return[v[0]/l,v[1]/l]};
  function transform(point,z,camera){const dx=point[0]-CENTER[0],dy=point[1]-CENTER[1],cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),x=dx*cy-dy*sy,y=dx*sy+dy*cy;return{x,y:y*cp-z*sp,depth:y*sp+z*cp}}
  function project(point,z,metrics,camera){const t=transform(point,z,camera),scale=Math.min((metrics.width-170)/900,(metrics.height-90)/650),distance=1260,p=distance/(distance-t.depth);return{x:metrics.width/2+t.x*scale*p,y:metrics.height/2+t.y*scale*p+18,depth:t.depth}}
  function prism(wall){const d=norm([wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]]),o=mul(perp(d),wall.thickness/2);return[add(wall.a,o),add(wall.b,o),add(wall.b,mul(o,-1)),add(wall.a,mul(o,-1))]}
  function faces(wall,camera){const b=prism(wall),base=wall.outer?[244,244,244]:[249,249,249],shade=f=>`rgb(${base.map(v=>Math.round(v*f)).join(',')})`;
    return[
      [[b[0],b[1],b[1],b[0]],[0,0,HEIGHT,HEIGHT],shade(.96)],[[b[1],b[2],b[2],b[1]],[0,0,HEIGHT,HEIGHT],shade(.88)],[[b[2],b[3],b[3],b[2]],[0,0,HEIGHT,HEIGHT],shade(.8)],[b,[HEIGHT,HEIGHT,HEIGHT,HEIGHT],'rgba(255,255,255,.7)']
    ].map(([points,zs,fill])=>({points,zs,fill,stroke:'rgba(150,150,150,.36)',depth:points.reduce((s,p,i)=>s+transform(p,zs[i],camera).depth,0)/points.length}));
  }
  function inside(point,polygon){let value=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[xi,yi]=polygon[i],[xj,yj]=polygon[j];if(((yi>point[1])!==(yj>point[1]))&&(point[0]<(xj-xi)*(point[1]-yi)/(yj-yi+.000001)+xi))value=!value}return value}
  function ellipse(center,major,minor,ra,rb,steps=30){const a=norm(major),b=norm(minor);return Array.from({length:steps},(_,i)=>{const q=Math.PI*2*i/steps;return add(add(center,mul(a,Math.cos(q)*ra)),mul(b,Math.sin(q)*rb))})}
  window.ApartmentGeometry={HEIGHT,CENTER,OUTER,WALLS,WINDOWS,add,mul,mid,perp,norm,transform,project,faces,inside,ellipse};
})();
