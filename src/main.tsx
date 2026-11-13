import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import useWikiLens from './useWikiLens';
import Explorer from './Explorer';
import './styles.css';
import './explorer.css';
function App(){
 const state=useWikiLens('prism');
 useEffect(()=>{document.title='WikiLens — A living atlas of ideas';},[]);
 return <><a href="#main-content" className="skip-link">Skip to explorer</a><Explorer state={state}/>{state.toast?<div className="toast" role="status">{state.toast}</div>:null}</>;
}
const appRoot=createRoot(document.getElementById('root')!);
appRoot.render(<App/>);
// Dispose the old animation loops when Vite replaces this entry module.
if(import.meta.hot)import.meta.hot.dispose(()=>appRoot.unmount());
