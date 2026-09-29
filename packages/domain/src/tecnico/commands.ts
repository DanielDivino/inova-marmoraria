import { type TechnicalDocument, type Piece } from './schema.js';
import { bounds, contornoDosParametros, rotate, sampleContour } from './geometry.js';
export function updatePiece(doc:TechnicalDocument,id:string,patch:Partial<Piece>):TechnicalDocument {
  const original=doc.pieces.find(p=>p.id===id);if(!original||original.locked||doc.layers.find(l=>l.id===original.layerId)?.locked)return doc;
  const piece={...original,...patch};if(piece.geometryMode==='PARAMETRIC'&&piece.parameters)piece.contour=contornoDosParametros(id,piece.parameters);
  let pieces=doc.pieces.map(p=>p.id===id?piece:p);
  const group=doc.assemblies.find(a=>a.pieceIds.includes(id));if(group?.locked)return doc;
  if(group&&(patch.x!==undefined||patch.y!==undefined||patch.rotationDeg!==undefined)) pieces=pieces.map(p=>{if(p.id===id||!group.pieceIds.includes(p.id))return p;const v=rotate({x:p.x-original.x,y:p.y-original.y},piece.rotationDeg-original.rotationDeg);return {...p,x:piece.x+v.x,y:piece.y+v.y,rotationDeg:p.rotationDeg+piece.rotationDeg-original.rotationDeg};});
  const pending=new Set([id]);for(let i=0;i<doc.constraints.length;i++)for(const c of doc.constraints){if(!pending.has(c.targetPieceId))continue;const target=pieces.find(p=>p.id===c.targetPieceId);if(target){const v=rotate({x:c.dx,y:c.dy},target.rotationDeg);pieces=pieces.map(p=>p.id===c.pieceId?{...p,x:target.x+v.x,y:target.y+v.y,rotationDeg:target.rotationDeg+c.rotationOffset}:p);pending.add(c.pieceId);}}
  return {...doc,pieces};
}
/** Centro da peça (meio da caixa do contorno) no mundo: é em volta dele que a peça gira. */
export function centroDaPecaNoMundo(piece:Piece) {
  const caixa=bounds(sampleContour(piece.contour,2));const centro=rotate({x:(caixa.minX+caixa.maxX)/2,y:(caixa.minY+caixa.maxY)/2},piece.rotationDeg);
  return {x:centro.x+piece.x,y:centro.y+piece.y};
}
/** Gira a peça para `degrees` (0 a 360) em volta do próprio centro, que não sai do lugar. */
export function girarPeca(doc:TechnicalDocument,id:string,degrees:number):TechnicalDocument {
  const piece=doc.pieces.find(p=>p.id===id);if(!piece)return doc;
  const caixa=bounds(sampleContour(piece.contour,2));const local={x:(caixa.minX+caixa.maxX)/2,y:(caixa.minY+caixa.maxY)/2};
  const giro=Math.round((((degrees%360)+360)%360)*10)/10;const antes=rotate(local,piece.rotationDeg),depois=rotate(local,giro);
  return updatePiece(doc,id,{rotationDeg:giro,x:Math.round((piece.x+antes.x-depois.x)*10)/10,y:Math.round((piece.y+antes.y-depois.y)*10)/10});
}
export function deletePiece(doc:TechnicalDocument,id:string):TechnicalDocument {return {...doc,pieces:doc.pieces.filter(p=>p.id!==id),features:doc.features.filter(f=>f.pieceId!==id),dimensions:doc.dimensions.filter(d=>d.from.pieceId!==id&&d.to.pieceId!==id),constraints:doc.constraints.filter(c=>c.pieceId!==id&&c.targetPieceId!==id),assemblies:doc.assemblies.map(a=>({...a,pieceIds:a.pieceIds.filter(p=>p!==id)})).filter(a=>a.pieceIds.length)};}
export function duplicatePiece(doc:TechnicalDocument,id:string,newId:string):TechnicalDocument {
  const piece=doc.pieces.find(p=>p.id===id);if(!piece)return doc;
  const fm=new Map(doc.features.filter(f=>f.pieceId===id).map(f=>[f.id,`${newId}-${f.id}`]));const vm=new Map(piece.contour.map((v,i)=>[v.id,`${newId}-v${i}`]));
  const copy={...piece,id:newId,name:piece.name.trim()?`${piece.name} (cópia)`:'',x:piece.x+150,y:piece.y+150,locked:false,contour:piece.contour.map(v=>({...v,id:vm.get(v.id)!})),dimensionLabels:Object.fromEntries(Object.entries(piece.dimensionLabels).flatMap(([edge,text])=>vm.has(edge)?[[vm.get(edge)!,text]]:[])),lockedEdges:piece.lockedEdges.flatMap(edge=>vm.has(edge)?[vm.get(edge)!]:[])};
  return {...doc,pieces:[...doc.pieces,copy],features:[...doc.features,...doc.features.filter(f=>f.pieceId===id).map(f=>({...f,id:fm.get(f.id)!,pieceId:newId,edgeId:f.edgeId?vm.get(f.edgeId):undefined,cutoutId:f.cutoutId?fm.get(f.cutoutId):undefined}))],dimensions:[...doc.dimensions,...doc.dimensions.filter(d=>d.from.pieceId===id&&d.to.pieceId===id).map(d=>({...d,id:`${newId}-${d.id}`,from:{pieceId:newId,vertexId:vm.get(d.from.vertexId)!},to:{pieceId:newId,vertexId:vm.get(d.to.vertexId)!}}))]};
}
export function snapPoint(doc:TechnicalDocument,p:{x:number;y:number},exclude:string,grid:number,tolerance:number) {
  let x=Math.round(p.x/grid)*grid,y=Math.round(p.y/grid)*grid;
  for(const piece of doc.pieces.filter(p=>p.id!==exclude))for(const point of [...piece.contour,{x:piece.contour.reduce((s,v)=>s+v.x,0)/piece.contour.length,y:piece.contour.reduce((s,v)=>s+v.y,0)/piece.contour.length}]){const v=rotate(point,piece.rotationDeg),wx=v.x+piece.x,wy=v.y+piece.y;if(Math.abs(wx-p.x)<tolerance)x=wx;if(Math.abs(wy-p.y)<tolerance)y=wy;}
  return {x:Math.round(x*10)/10,y:Math.round(y*10)/10};
}
