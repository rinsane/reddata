/* Source for the snippet both bookmarklets embed.

   Reddit exposes a session two different ways depending on which front end you
   are on, and neither is guaranteed. Try the bearer token first, fall back to
   the cookie + modhash pair that old reddit has always used, and say which one
   was found so a failure is diagnosable instead of mysterious. */

export const AUTH_SNIPPET = `
var findToken=function(){
  var t=null;
  try{t=window.___r&&window.___r.user&&window.___r.user.session&&window.___r.user.session.accessToken}catch(e){}
  if(!t){try{t=window.__reddit_session&&window.__reddit_session.accessToken}catch(e){}}
  if(!t){try{var m=document.documentElement.innerHTML.match(/"accessToken":"([A-Za-z0-9_\\-\\.]{20,})"/);if(m)t=m[1]}catch(e){}}
  return t;
};
var getAuth=async function(){
  var t=findToken();
  if(t)return{mode:'token',token:t};
  var r=await fetch('https://www.reddit.com/api/me.json',{credentials:'include'});
  if(!r.ok)return null;
  var j=await r.json();
  var d=j&&j.data;
  if(!d||!d.name)return null;
  return{mode:'cookie',modhash:d.modhash||'',name:d.name};
};
var subscribe=async function(a,names){
  var body=new URLSearchParams({action:'sub',skip_initial_defaults:'true',api_type:'json',sr_name:names.join(',')});
  if(a.mode==='token'){
    return fetch('https://oauth.reddit.com/api/subscribe',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/x-www-form-urlencoded'},body:body});
  }
  if(a.modhash)body.set('uh',a.modhash);
  return fetch('https://www.reddit.com/api/subscribe',{method:'POST',credentials:'include',headers:Object.assign({'Content-Type':'application/x-www-form-urlencoded'},a.modhash?{'X-Modhash':a.modhash}:{}),body:body});
};
`.replace(/\n\s*/g, "");
