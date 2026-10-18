import { createContext, useContext } from 'react';

export const UploadContext = createContext(() => {});
export const useUploadDialog = () => useContext(UploadContext);
