import type { TechnicalDocument, Vertex } from './schema.js';
import { featureContour, rotate } from './geometry.js';
// DXF AC1015: closed LWPOLYLINE with exact circular bulges, text and layers; mm.
export function exportDxf(doc:TechnicalDocument,revision:string) {
  const pairs:(string|number)[]=[];const put=(...v:(string|number)[])=>pairs.push(...v);
  put(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,0,'ENDSEC',0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,4);
  for(const [name,color] of [['PIECES',3],['CUTOUTS',1],['COMPONENTS',5],['NOTES',7]] as const)put(0,'LAYER',2,name,70,0,62,color,6,'CONTINUOUS');
  put(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  function poly(vertices:Vertex[],layer:string,x:number,y:number,rotation:number){put(0,'LWPOLYLINE',100,'AcDbEntity',8,layer,100,'AcDbPolyline',90,vertices.length,70,1);for(const p of vertices){const v=rotate(p,rotation);put(10,v.x+x,20,v.y+y,42,p.bulge);}}
  for(const piece of doc.pieces){poly(piece.contour,'PIECES',piece.x,piece.y,piece.rotationDeg);for(const feature of doc.features.filter(f=>f.pieceId===piece.id))if(['CUTOUT','HOLE','SINK','SCULPTED_SINK'].includes(feature.type))poly(featureContour(feature),['CUTOUT','HOLE'].includes(feature.type)?'CUTOUTS':'COMPONENTS',piece.x,piece.y,piece.rotationDeg);}
  put(0,'TEXT',8,'NOTES',10,0,20,-200,40,30,1,`INOVA ${revision} | mm | Local developed contours`,0,'ENDSEC',0,'EOF');
  const report=doc.features.filter(f=>['SKIRT','BACKSPLASH','EDGE_FINISH'].includes(f.type)).map(f=>`${f.name}: ${f.type}, borda ${f.edgeId}, inicio ${f.startMm}, extensao ${f.extentMm}, altura ${f.heightMm}, espessura ${f.thicknessMm}, perfil ${f.profile}. Detalhe nao representado como contorno de corte.`);
  if(doc.pieces.some(p=>p.tiltDeg))report.push('Pecas verticais exportadas em plano local desenvolvido, sem projecao que reduza medidas.');
  if(doc.features.some(f=>f.shape==='OVAL'))report.push('Elipses exportadas como polilinhas de 96 segmentos.');
  return {data:pairs.join('\n')+'\n',report};
}
