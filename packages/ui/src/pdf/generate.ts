// Erzeugt das PDF im Browser/in Electron (wird nur beim Export geladen).
import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';
import type { DocDefinition } from './documents';

pdfMake.addVirtualFileSystem(vfs);

export function createPdfBlob(doc: DocDefinition): Promise<Blob> {
  return pdfMake.createPdf(doc).getBlob();
}
