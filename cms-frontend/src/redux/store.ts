import { configureStore } from "@reduxjs/toolkit";
import rootPathReducer from "@/redux/rootPathSlice";
import schemaReducer from "@/redux/schemaSlice";
import realtimeDbReducer from "@/redux/realtimeDbSlice";

export const store = configureStore({
  reducer: {
    rootPath: rootPathReducer,
    schema: schemaReducer,
    realtimeDb: realtimeDbReducer,
  },
});
