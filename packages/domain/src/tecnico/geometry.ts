import { pieceSchema, type Diagnostic, type Feature, type Piece, type Point, type TechnicalDocument, type Vertex } from './schema.js';

// Numerical tolerance in mm, unrelated to the workshop's manufacturing tolerance.
export const EPS = 1e-6;
export const radians = (degrees: number) => degrees * Math.PI / 180;
export function rotate(p: Point, degrees: number): Point { const a = radians(-degrees); return {x:p.x*Math.cos(a)-p.y*Math.sin(a), y:p.x*Math.sin(a)+p.y*Math.cos(a)}; }
export function world(p: Point, piece: Piece) { const v = rotate({x:p.x, y:p.y*Math.cos(radians(piece.tiltDeg))}, piece.rotationDeg); return {x:v.x+piece.x,y:v.y+piece.y,z:piece.z+p.y*Math.sin(radians(piece.tiltDeg))}; }
export function arc(a: Point, b: Point, bulge: number) {
  const chord = Math.hypot(b.x-a.x,b.y-a.y), theta=4*Math.atan(bulge);
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}, k=(1-bulge*bulge)/(4*bulge);
  const center={x:mid.x-(b.y-a.y)*k,y:mid.y+(b.x-a.x)*k};
  return {center, radius:chord*(1+bulge*bulge)/(4*Math.abs(bulge)), start:Math.atan2(a.y-center.y,a.x-center.x), theta};
}
export function sampleContour(vertices: Vertex[], tolerance=.1): Point[] {
  return vertices.flatMap((v,i) => {
    const next=vertices[(i+1)%vertices.length]; if(!v.bulge) return [{x:v.x,y:v.y}];
    const a=arc(v,next,v.bulge); if (!Number.isFinite(a.radius) || a.radius<EPS) return [v];
    const steps=Math.min(2048, Math.max(2,Math.ceil(Math.abs(a.theta)/(2*Math.acos(Math.max(-1,1-tolerance/a.radius))))));
    return Array.from({length:steps},(_,j)=>({x:a.center.x+a.radius*Math.cos(a.start+a.theta*j/steps),y:a.center.y+a.radius*Math.sin(a.start+a.theta*j/steps)}));
  });
}
export const bounds = (points: Point[]) => ({ minX:Math.min(...points.map(p=>p.x)), minY:Math.min(...points.map(p=>p.y)), maxX:Math.max(...points.map(p=>p.x)), maxY:Math.max(...points.map(p=>p.y)) });
export const signedArea = (points: Point[]) => points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.y-q.x*p.y;},0)/2;
export function contourArea(vertices: Vertex[]) {return Math.abs(signedArea(vertices)+vertices.reduce((s,v,i)=>{if(!v.bulge)return s;const a=arc(v,vertices[(i+1)%vertices.length],v.bulge);return s+a.radius*a.radius*(a.theta-Math.sin(a.theta))/2;},0));}
export function edgeLength(piece: Piece, edgeId: string) { const i=piece.contour.findIndex(v=>v.id===edgeId); if(i<0)return 0; const p=piece.contour[i], q=piece.contour[(i+1)%piece.contour.length]; return p.bulge ? Math.abs(arc(p,q,p.bulge).radius*arc(p,q,p.bulge).theta) : Math.hypot(q.x-p.x,q.y-p.y); }
export function edgePoint(piece: Piece, edgeId: string, distance: number) {const i=piece.contour.findIndex(v=>v.id===edgeId);const p=piece.contour[i],q=piece.contour[(i+1)%piece.contour.length];if(!p) return {x:0,y:0};const t=distance/edgeLength(piece,edgeId);if(p.bulge){const a=arc(p,q,p.bulge);return {x:a.center.x+a.radius*Math.cos(a.start+a.theta*t),y:a.center.y+a.radius*Math.sin(a.start+a.theta*t)};}return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};}
export function parametricContour(id: string, shape: 'RECTANGLE'|'L'|'CIRCLE'|'ROUNDED', width:number, length:number, radius=0, arm=600): Vertex[] {
  const r=Math.min(radius,width/2,length/2);const b=Math.tan(Math.PI/8);
  let points:number[][];
  if(shape==='CIRCLE') { const r=width/2; points=[[r,0,b],[width,r,b],[r,width,b],[0,r,b]]; }
  else if(shape==='L') points=[[0,0],[width,0],[width,arm],[arm,arm],[arm,length],[0,length]];
  else if(shape==='ROUNDED' && r>0) points=[[r,0],[width-r,0,b],[width,r],[width,length-r,b],[width-r,length],[r,length,b],[0,length-r],[0,r,b]];
  else points=[[0,0],[width,0],[width,length],[0,length]];
  return points.map(([x,y,bulge=0],i)=>({id:`${id}-v${i}`,x,y,bulge}));
}
export function makePiece(id:string, shape:'RECTANGLE'|'L'|'CIRCLE'|'ROUNDED'='RECTANGLE', index=0):Piece {
  const parameters={shape,width:2440,length:shape==='L'?1500:650,radius:100,arm:600};
  return pieceSchema.parse({id,name:`Peça ${index+1}`,contour:parametricContour(id,shape,parameters.width,parameters.length,parameters.radius,parameters.arm),geometryMode:'PARAMETRIC',parameters,thicknessMm:20,x:index*300,y:index*900});
}
export function featureContour(f:Feature):Vertex[] {
  let vertices:Vertex[];
  if(f.type==='HOLE'){const r=f.diameterMm/2;vertices=parametricContour(f.id,'CIRCLE',f.diameterMm,f.diameterMm).map(p=>({...p,x:p.x-r,y:p.y-r}));}
  else if(f.shape==='OVAL') vertices=Array.from({length:96},(_,i)=>({id:`${f.id}-${i}`,x:f.widthMm/2*Math.cos(i*Math.PI/48),y:f.lengthMm/2*Math.sin(i*Math.PI/48),bulge:0}));
  else vertices=parametricContour(f.id,f.radiusMm?'ROUNDED':'RECTANGLE',f.widthMm,f.lengthMm,f.radiusMm).map(p=>({...p,x:p.x-f.widthMm/2,y:p.y-f.lengthMm/2}));
  return vertices.map(p=>({...p,...rotate(p,f.rotationDeg),x:rotate(p,f.rotationDeg).x+f.x,y:rotate(p,f.rotationDeg).y+f.y}));
}
const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const onSegment=(p:Point,a:Point,b:Point)=>Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;
function intersects(a:Point,b:Point,c:Point,d:Point,strict=false) {const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);return x*y< -EPS&&u*v< -EPS || (!strict&&(onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d)));}
export function inside(p:Point,poly:Point[]) {let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(onSegment(p,a,b))return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
function selfIntersects(poly:Point[]) { for(let i=0;i<poly.length;i++) for(let j=i+2;j<poly.length;j++){if(i===0&&j===poly.length-1)continue;if(intersects(poly[i],poly[(i+1)%poly.length],poly[j],poly[(j+1)%poly.length]))return true;}return false; }
function distanceSegment(p:Point,a:Point,b:Point) {const l=(b.x-a.x)**2+(b.y-a.y)**2;const t=l?Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/l)):0;return Math.hypot(p.x-a.x-t*(b.x-a.x),p.y-a.y-t*(b.y-a.y));}
export function validateTechnicalDocument(doc:TechnicalDocument):Diagnostic[] {
  const result:Diagnostic[]=[]; const add=(severity:Diagnostic['severity'],code:string,message:string,elementId?:string)=>result.push({severity,code,message,elementId});
  const ids=new Set<string>(); for(const entry of [...doc.pieces,...doc.features,...doc.layers,...doc.assemblies,...doc.dimensions,...doc.annotations,...doc.constraints,...doc.views,...doc.pieces.flatMap(p=>p.contour)]) {if(ids.has(entry.id))add('STRUCTURAL','DUPLICATE_ID','Identificador repetido.',entry.id);ids.add(entry.id);}
  if(doc.pieces.reduce((sum,p)=>sum+p.contour.length,0)>10000)add('STRUCTURAL','SEGMENT_LIMIT','O limite é de 10 mil segmentos.');
  const shapes=new Map<string,Point[]>();
  for(const piece of doc.pieces) {
    const poly=sampleContour(piece.contour,.5);shapes.set(piece.id,poly);
    if(poly.length>10000){add('STRUCTURAL','TESSELLATION_LIMIT','Contorno muito complexo.',piece.id);continue;}
    if(contourArea(piece.contour)<EPS||selfIntersects(poly))add('STRUCTURAL','INVALID_CONTOUR','Contorno sem área ou com cruzamentos.',piece.id);
    if(piece.contour.some((p,i)=>Math.hypot(p.x-piece.contour[(i+1)%piece.contour.length].x,p.y-piece.contour[(i+1)%piece.contour.length].y)<EPS))add('STRUCTURAL','ZERO_EDGE','Aresta de comprimento zero.',piece.id);
    if(piece.thicknessMm<=0)add('TECHNICAL','THICKNESS','A espessura deve ser positiva.',piece.id);
    if(!doc.layers.some(l=>l.id===piece.layerId))add('STRUCTURAL','MISSING_LAYER','Camada inexistente.',piece.id);
    if(piece.geometryMode==='PARAMETRIC') {const p=piece.parameters;if(!p||JSON.stringify(parametricContour(piece.id,p.shape,p.width,p.length,p.radius,p.arm))!==JSON.stringify(piece.contour))add('STRUCTURAL','PARAMETER_MISMATCH','Contorno diverge dos parâmetros.',piece.id);else if(p.width<=0||p.length<=0||(p.shape==='L'&&(p.arm<=0||p.arm>=Math.min(p.width,p.length))))add('TECHNICAL','PARAMETERS','Dimensões incompatíveis.',piece.id);}
  }
  for(const f of doc.features) {
    const piece=doc.pieces.find(p=>p.id===f.pieceId),poly=shapes.get(f.pieceId);if(!piece||!poly){add('STRUCTURAL','MISSING_PARENT','Componente sem peça-pai.',f.id);continue;}
    if(f.cutoutId&&!doc.features.some(c=>c.id===f.cutoutId&&c.type==='CUTOUT'&&c.pieceId===f.pieceId))add('STRUCTURAL','CUTOUT_LINK','Vínculo de recorte inválido.',f.id);
    if(['SKIRT','BACKSPLASH','EDGE_FINISH'].includes(f.type)) {if(!piece.contour.some(p=>p.id===f.edgeId))add('STRUCTURAL','MISSING_EDGE','Borda vinculada inexistente.',f.id);else if(f.extentMm<=0||f.startMm<0||f.startMm+f.extentMm>edgeLength(piece,f.edgeId!)+EPS)add('TECHNICAL','EDGE_EXTENT','Trecho ultrapassa a borda.',f.id);if(f.heightMm<=0||f.thicknessMm<=0)add('TECHNICAL','EDGE_SIZE','Altura e espessura devem ser positivas.',f.id);continue;}
    if(f.widthMm<=0||f.lengthMm<=0||f.diameterMm<=0||f.depthMm<=0){add('TECHNICAL','FEATURE_SIZE','Dimensões devem ser positivas.',f.id);continue;}
    const fp=sampleContour(featureContour(f),.5);
    const crosses=fp.some((a,i)=>poly.some((b,j)=>intersects(a,fp[(i+1)%fp.length],b,poly[(j+1)%poly.length],true)));
    if(crosses||!fp.every(p=>inside(p,poly)))add('TECHNICAL','FEATURE_OUTSIDE_PIECE','Componente ultrapassa o contorno da peça.',f.id);
    if(doc.manufacturing.minimumClearanceMm!==null&&['CUTOUT','HOLE'].includes(f.type)&&fp.some(p=>poly.some((a,i)=>distanceSegment(p,a,poly[(i+1)%poly.length])<doc.manufacturing.minimumClearanceMm! - EPS)))add('TECHNICAL','CLEARANCE','Afastamento inferior ao mínimo configurado.',f.id);
    if(f.type==='SCULPTED_SINK'&&(f.wallMm<=0||f.bottomMm<=0||2*f.wallMm>=Math.min(f.widthMm,f.lengthMm)||Math.abs(f.drainX)+f.drainDiameterMm/2>f.widthMm/2-f.wallMm||Math.abs(f.drainY)+f.drainDiameterMm/2>f.lengthMm/2-f.wallMm))add('TECHNICAL','SCULPTED_PARAMETERS','Paredes ou posição do ralo incompatíveis.',f.id);
  }
  for(const p of doc.pieces){const holes=doc.features.filter(f=>f.pieceId===p.id&&['CUTOUT','HOLE'].includes(f.type));for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++){const a=sampleContour(featureContour(holes[i]),1),b=sampleContour(featureContour(holes[j]),1);if(a.some(v=>inside(v,b))||b.some(v=>inside(v,a))||a.some((v,k)=>b.some((w,l)=>intersects(v,a[(k+1)%a.length],w,b[(l+1)%b.length],true))))add('TECHNICAL','CUTOUT_OVERLAP','Recortes se sobrepõem.',holes[j].id);}}
  for(const dim of doc.dimensions) for(const ref of [dim.from,dim.to]) if(!doc.pieces.some(p=>p.id===ref.pieceId&&p.contour.some(v=>v.id===ref.vertexId)))add('STRUCTURAL','DIMENSION_REFERENCE','Referência de cota inexistente.',dim.id);
  for(const a of doc.assemblies)if(a.pieceIds.some(id=>!doc.pieces.some(p=>p.id===id)))add('STRUCTURAL','ASSEMBLY_REFERENCE','Conjunto referencia peça inexistente.',a.id);
  for(const c of doc.constraints){if(c.pieceId===c.targetPieceId||![c.pieceId,c.targetPieceId].every(id=>doc.pieces.some(p=>p.id===id)))add('STRUCTURAL','CONSTRAINT_REFERENCE','Relação inválida.',c.id);const visited=new Set([c.pieceId]);let next=c.targetPieceId;while(next){if(visited.has(next)){add('STRUCTURAL','CONSTRAINT_CYCLE','Relações formam um ciclo.',c.id);break;}visited.add(next);next=doc.constraints.find(x=>x.pieceId===next)?.targetPieceId??'';}}
  if(doc.manufacturing.minimumClearanceMm===null||doc.manufacturing.toleranceMm===null)add('WARNING','MANUFACTURING_UNSET','Defina folga e tolerância de fabricação antes de liberar.');
  if(!doc.pieces.length)add('TECHNICAL','EMPTY_DESIGN','Adicione ao menos uma peça antes da conferência.');
  return result;
}
