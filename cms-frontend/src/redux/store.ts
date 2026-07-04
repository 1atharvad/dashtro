import { configureStore } from "@reduxjs/toolkit";
import rootPathReducer from "@/redux/rootPathSlice";
import schemaReducer from "@/redux/schemaSlice";
import schemaPresetReducer from "@/redux/schemaPresetSlice";
import collectionReducer from "@/redux/collectionSlice";
import documentReducer from "@/redux/documentSlice";
import projectReducer from "@/redux/projectSlice";
import workspaceReducer from "@/redux/workspaceSlice";
import categoryReducer from "@/redux/categorySlice";
import richTextComponentReducer from "@/redux/richTextComponentSlice";
import realtimeDbReducer from "@/redux/realtimeDbSlice";

export const store = configureStore({
  reducer: {
    rootPath: rootPathReducer,
    schema_preset: schemaPresetReducer,
    schema: schemaReducer,
    collections: collectionReducer,
    documents: documentReducer,
    projects: projectReducer,
    workspaces: workspaceReducer,
    categories: categoryReducer,
    richTextComponents: richTextComponentReducer,
    realtimeDb: realtimeDbReducer,
  },
});
