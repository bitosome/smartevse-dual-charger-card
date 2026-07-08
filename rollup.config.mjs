import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

// The built bundle is emitted into dist/ and published as a GitHub release
// asset, matching the other bitosome cards (HACS resolves it by `filename`).
export default {
  input: 'src/smartevse-dual-charger-card.ts',
  output: {
    file: 'dist/smartevse-dual-charger-card.js',
    format: 'es',
    sourcemap: false,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' }),
    terser(),
  ],
};
