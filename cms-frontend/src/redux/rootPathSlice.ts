import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface RootPathState {
  value: string;
}

const initialState: RootPathState = {
  value: '',
};

export const rootPathSlice = createSlice({
  name: 'rootPath',
  initialState,
  reducers: {
    setRootPath: (state, action: PayloadAction<string>) => {
      state.value = action.payload;
    },
  },
});

export const { setRootPath } = rootPathSlice.actions;
export default rootPathSlice.reducer;
