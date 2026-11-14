import { createRoot } from 'react-dom/client';
import Atlas from './Atlas';
import './styles.css';
const appRoot=createRoot(document.getElementById('root')!);
appRoot.render(<Atlas/>);
// Dispose the old animation loops when Vite replaces this entry module.
if(import.meta.hot)import.meta.hot.dispose(()=>appRoot.unmount());
