import { configureStore } from "@reduxjs/toolkit";
import rootPathReducer from "@/redux/rootPathSlice";
import realtimeDbReducer from "@/redux/realtimeDbSlice";

export const store = configureStore({
  reducer: {
    rootPath: rootPathReducer,
    realtimeDb: realtimeDbReducer,
  },
});
