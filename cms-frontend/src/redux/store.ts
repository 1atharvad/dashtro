import { configureStore } from "@reduxjs/toolkit";
import rootPathReducer from "@/redux/rootPathSlice";
import schemaReducer from "@/redux/schemaSlice";
import collectionReducer from "@/redux/collectionSlice";
import documentReducer from "@/redux/documentSlice";
import richTextComponentReducer from "@/redux/richTextComponentSlice";
import realtimeDbReducer from "@/redux/realtimeDbSlice";

export const store = configureStore({
  reducer: {
    rootPath: rootPathReducer,
    schema: schemaReducer,
    collections: collectionReducer,
    documents: documentReducer,
    richTextComponents: richTextComponentReducer,
    realtimeDb: realtimeDbReducer,
  },
});
