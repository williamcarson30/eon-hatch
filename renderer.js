/* Original signed-distance ray tracer. No external rendering dependencies. */
(() => {
  'use strict';
  const VERTEX = `attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}`;
  const FRAGMENT = `precision highp float;
uniform vec2 u_resolution;uniform float u_time;uniform float u_stage;uniform float u_hit;uniform float u_species;uniform float u_motion;uniform float u_egg;uniform float u_quality;uniform vec3 u_accent;
const float PI=3.14159265;
mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 hash2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i.xy+vec2(37.*i.z)),hash(i.xy+vec2(1.,0.)+vec2(37.*i.z)),f.x),mix(hash(i.xy+vec2(0.,1.)+vec2(37.*i.z)),hash(i.xy+vec2(1.)+vec2(37.*i.z)),f.x),f.y),mix(mix(hash(i.xy+vec2(37.*(i.z+1.))),hash(i.xy+vec2(1.,0.)+vec2(37.*(i.z+1.))),f.x),mix(hash(i.xy+vec2(0.,1.)+vec2(37.*(i.z+1.))),hash(i.xy+vec2(1.)+vec2(37.*(i.z+1.))),f.x),f.y),f.z);}
vec3 local(vec3 p){p.y-=.1+sin(u_time*.7)*.025*u_motion;p.xy=rot(sin(u_time*32.)*.07*u_hit)*p.xy;p.xz=rot(.34+sin(u_time*.17)*.08*u_motion)*p.xz;return p;}
float eggSDF(vec3 p){p=local(p);float w=.83-.14*clamp(p.y,-1.3,1.3);vec3 q=p/vec3(w,1.25,w);return (length(q)-1.)*.68;}
float traceEgg(vec3 ro,vec3 rd){
if(u_egg<.5)return -1.;
float b=dot(ro,rd),c=dot(ro,ro)-2.6,h=b*b-c;if(h<0.)return -1.;
float t=max(0.,-b-sqrt(h));
for(int i=0;i<56;i++){vec3 p=ro+rd*t;float d=eggSDF(p);if(d<.0016)return t;t+=max(d,.001);if(t>9.)break;}
return -1.;}
vec3 normalAt(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(eggSDF(p+e.xyy)-eggSDF(p-e.xyy),eggSDF(p+e.yxy)-eggSDF(p-e.yxy),eggSDF(p+e.yyx)-eggSDF(p-e.yyx)));}
float shadow(vec3 p,vec3 light){if(u_egg<.5)return 1.;vec3 d=light-p;float farT=length(d);d/=farT;float result=1.,t=.03;for(int i=0;i<24;i++){float h=eggSDF(p+d*t);if(h<.001)return .12;result=min(result,10.*h/t);t+=clamp(h,.025,.18);if(t>farT)break;}return clamp(result,.12,1.);}
vec2 fracture(vec2 p){vec2 g=floor(p),f=fract(p);float d1=9.,d2=9.;vec2 cell=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 o=vec2(float(x),float(y));vec2 q=o+hash2(g+o)-f;float d=dot(q,q);if(d<d1){d2=d1;d1=d;cell=g+o;}else if(d<d2)d2=d;}return vec2(sqrt(d2)-sqrt(d1),hash(cell+17.));}
vec3 sky(vec3 d){vec3 c=mix(vec3(.035,.085,.09),vec3(.19,.32,.3),max(d.y,0.));float a=pow(max(dot(d,normalize(vec3(-2.,4.,3.))),0.),50.);float b=pow(max(dot(d,normalize(vec3(3.,1.,-2.))),0.),16.);return c+vec3(1.1,.77,.36)*a+u_accent*b*.45;}
vec3 eggShade(vec3 p,vec3 rd){
vec3 lp=local(p);vec3 n=normalAt(p);vec3 v=-rd;vec3 l=normalize(vec3(-3.,4.,4.)-p);vec3 h=normalize(l+v);
float tex=noise(lp*34.);float grain=noise(lp*115.);vec3 base;
if(u_species<.5){base=mix(vec3(.13,.09,.044),vec3(.69,.45,.18),noise(lp*5.));base*=.75+tex*.4;}
else if(u_species<1.5){base=mix(vec3(.08,.26,.32),vec3(.65,.84,.83),noise(lp*8.));base*=.85+tex*.2;}
else {base=mix(vec3(.07,.035,.18),vec3(.4,.18,.5),noise(lp*4.));base+=vec3(.3,.25,.45)*pow(grain,27.);}
float longitude=atan(lp.z,lp.x);float latitude=acos(clamp(lp.y/1.25,-1.,1.));vec2 uv=vec2(longitude*2.3,latitude*3.3);
vec2 f=fracture(uv);float enabledCrack=step(f.y,u_stage/10.)*step(.5,u_stage);float crack=(1.-smoothstep(.012+.002*u_stage,.026+.003*u_stage,f.x))*enabledCrack;
float edge=(1.-smoothstep(.035,.07,f.x))*enabledCrack;
float bands=pow(abs(sin(latitude*11.+sin(longitude*4.)*.35)),45.);base=mix(base,vec3(.56,.4,.19),bands*.3);
base*=.92+grain*.14;base=mix(base,base*.06,edge*.75);
float ndl=max(dot(n,l),0.);float ao=.65+.35*smoothstep(-1.15,.3,p.y);float fres=pow(1.-max(dot(n,v),0.),5.);
float spec=pow(max(dot(n,h),0.),u_species>1.5?100.:64.);float rim=pow(1.-max(dot(n,v),0.),2.6);
vec3 col=base*(vec3(.2,.28,.25)*ao+vec3(1.15,.93,.63)*ndl)+vec3(1.,.88,.64)*spec*.8;
vec3 ref=sky(reflect(rd,n));col+=ref*(.22+fres*.7);col+=u_accent*rim*.32;
col+=u_accent*crack*(2.0+u_stage*.13+sin(u_time*1.8)*.2*u_motion);col+=u_accent*edge*.12;
return col;}
void main(){
vec2 uv=(gl_FragCoord.xy*2.-u_resolution.xy)/u_resolution.y;
vec3 ro=vec3(0.,.8,5.9);vec3 target=vec3(0.,-.03,0.);vec3 fw=normalize(target-ro);vec3 rt=normalize(cross(fw,vec3(0.,1.,0.)));vec3 up=cross(rt,fw);vec3 rd=normalize(fw+uv.x*rt*.48+uv.y*up*.48);
float te=traceEgg(ro,rd);float tf=(-1.25-ro.y)/rd.y;vec3 col=vec3(0.);float alpha=0.;
if(te>0.&&(tf<0.||te<tf)){vec3 p=ro+rd*te;col=eggShade(p,rd);alpha=1.;}
else if(tf>0.){vec3 p=ro+rd*tf;float r=length(p.xz);if(r<1.95){float mar=noise(p*12.);float s=shadow(p+vec3(0.,.01,0.),vec3(-3.,4.,4.));float rings=pow(abs(sin(r*17.)),50.);col=vec3(.06,.10,.095)*(.55+mar*.7)*s;col+=vec3(.43,.32,.16)*rings*.3;float ring=exp(-abs(r-1.64)*110.)+exp(-abs(r-1.77)*110.);col+=u_accent*ring*.65;float tr=traceEgg(p+vec3(0.,.01,0.),reflect(rd,vec3(0.,1.,0.)));if(tr>0.&&u_quality>.5){vec3 rp=p+vec3(0.,.01,0.)+reflect(rd,vec3(0.,1.,0.))*tr;col+=eggShade(rp,reflect(rd,vec3(0.,1.,0.)))*.21;}col+=u_accent*exp(-r*2.8)*.08;alpha=(1.-smoothstep(1.73,1.95,r))*.92;}}
vec2 point=gl_FragCoord.xy/u_resolution;float sparkle=0.;
for(int i=0;i<12;i++){float j=float(i);vec2 q=vec2(hash(vec2(j,4.)),hash(vec2(j,9.)));q.y=fract(q.y+u_time*(.006+hash(q)*.008)*u_motion);q.x+=sin(u_time*.3+j)*.014*u_motion;float d=length((point-q)*vec2(u_resolution.x/u_resolution.y,1.));sparkle+=exp(-d*600.)*(.45+.45*sin(u_time*1.2+j));}
col+=u_accent*sparkle;alpha=max(alpha,min(sparkle,.7));
col=col/(1.+col*.65);col=pow(max(col,vec3(0.)),vec3(.85));gl_FragColor=vec4(col,alpha);
}`;
  class EggRenderer {
    constructor(canvas,onStatus){
      this.canvas=canvas;this.onStatus=onStatus;this.hit=0;this.last=0;this.ready=false;this.quality='balanced';this.motion=true;this.species=0;this.stage=0;this.hatched=false;this.accent=[1,.46,.13];
      try{this.init();}catch(e){console.warn('Egg renderer fallback:',e.message);this.fallback();}
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;this.fallback();});
      canvas.addEventListener('webglcontextrestored',()=>{try{this.init();}catch(e){this.fallback();}});
      if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);}else window.addEventListener('resize',()=>this.resize());
    }
    init(){
      const gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:false});if(!gl)throw Error('WebGL unavailable');this.gl=gl;
      const compile=(type,src)=>{const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
      const v=compile(gl.VERTEX_SHADER,VERTEX),f=compile(gl.FRAGMENT_SHADER,FRAGMENT);const p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.deleteShader(v);gl.deleteShader(f);this.program=p;gl.useProgram(p);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      this.u={};for(const key of ['resolution','time','stage','hit','species','motion','egg','quality','accent'])this.u[key]=gl.getUniformLocation(p,'u_'+key);
      this.ready=true;this.canvas.hidden=false;document.getElementById('fallback-egg').hidden=true;this.resize();
    }
    fallback(){this.ready=false;this.canvas.hidden=true;document.getElementById('fallback-egg').hidden=this.hatched;this.onStatus?.('STANDARD LIGHTING');}
    configure(s){this.quality=s.settings.quality;this.motion=s.settings.motion;this.species=s.selected;this.stage=EonCore.cracks(s);this.hatched=s.hatched[s.selected];this.accent=EonCore.SPECIES[s.selected].rgb;this.resize();if(!this.ready){document.getElementById('fallback-egg').hidden=this.hatched;this.updateFallback();}}
    resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h||!this.ready)return;const cap=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);let rh=this.quality==='ultra'?1440:this.quality==='eco'?Math.min(h,480):Math.min(h*window.devicePixelRatio,900);rh=Math.min(rh,cap,cap*h/w);const rw=Math.round(rh*w/h);rh=Math.round(rh);if(this.canvas.width!==rw||this.canvas.height!==rh){this.canvas.width=rw;this.canvas.height=rh;this.gl.viewport(0,0,rw,rh);}this.onStatus?.(this.quality==='ultra'?'1440p · RAY TRACED':'RAY TRACED · '+(this.quality==='eco'?'ECO':'BALANCED'));}
    pulse(){this.hit=this.motion?1:0;}
    updateFallback(){const lines=['M88 22l-10 33 18 19-9 34','M148 99l-28 13 12 24-32 21','M39 83l20 26-15 19 16 29','M92 204l18-24-12-25 9-28','M55 179l18-21-13-23 16-16','M124 50l-9 24 18 18-9 26','M24 149l27 9 10 22-6 30','M151 172l-24 10-8 30','M87 94l23 16-12 28','M92 35l17 14-11 26'];document.getElementById('fallback-cracks').innerHTML=lines.slice(0,this.stage).map(d=>'<path d="'+d+'"/>').join('');document.getElementById('fallback-cracks').setAttribute('stroke',EonCore.SPECIES[this.species].color);document.getElementById('fallback-egg').style.filter='drop-shadow(0 0 25px '+EonCore.SPECIES[this.species].color+'30)';}
    render(time){if(!this.ready)return;const fps=this.quality==='eco'?20:30;if(time-this.last<1000/fps)return;const dt=(time-this.last)/1000;this.last=time;this.hit=Math.max(0,this.hit-dt*3);const gl=this.gl;gl.useProgram(this.program);gl.uniform2f(this.u.resolution,this.canvas.width,this.canvas.height);gl.uniform1f(this.u.time,time/1000);gl.uniform1f(this.u.stage,this.stage);gl.uniform1f(this.u.hit,this.hit);gl.uniform1f(this.u.species,this.species);gl.uniform1f(this.u.motion,this.motion?1:0);gl.uniform1f(this.u.egg,this.hatched?0:1);gl.uniform1f(this.u.quality,this.quality==='eco'?0:1);gl.uniform3fv(this.u.accent,this.accent);gl.drawArrays(gl.TRIANGLES,0,6);}
  }
  window.EggRenderer=EggRenderer;
})();
