declare module 'pdfmake/build/pdfmake' {
  interface PdfDocument {
    getBlob(): Promise<Blob>;
    getBuffer(): Promise<Uint8Array>;
  }
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(doc: Record<string, unknown>): PdfDocument;
  };
  export default pdfMake;
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}
declare module 'pdfmake' {
  const pdfmake: {
    addFonts(fonts: Record<string, Record<string, string>>): void;
    setUrlAccessPolicy?(fn: (url: string) => boolean): void;
    setLocalAccessPolicy?(fn: (path: string) => boolean): void;
    createPdf(doc: Record<string, unknown>): { getBuffer(): Promise<Uint8Array> };
  };
  export default pdfmake;
}
