import { configureStore } from "@reduxjs/toolkit";
import rootPathReducer from "@/redux/rootPathSlice";
import schemaReducer from "@/redux/schemaSlice";
import schemaPresetReducer from "@/redux/schemaPresetSlice";
import collectionReducer from "@/redux/collectionSlice";
import documentSlice from "@/redux/documentSlice";

export const store = configureStore({
  reducer: {
    rootPath: rootPathReducer,
    schema_preset: schemaPresetReducer,
    schema: schemaReducer,
    collections: collectionReducer,
    documents: documentSlice
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
