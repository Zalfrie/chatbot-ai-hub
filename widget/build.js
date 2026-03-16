// build.js — esbuild bundler for ChatbotHub widget
import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

mkdirSync('./dist', { recursive: true });

const sharedOptions = {
  entryPoints: ['src/widget.ts'],
  bundle: true,
  platform: 'browser',
  target: ['es2017', 'chrome58', 'firefox57', 'safari11'],
  globalName: 'ChatbotHubWidget',
};

async function build() {
  // Development build — readable
  await esbuild.build({
    ...sharedOptions,
    outfile: 'dist/widget.js',
    minify: false,
    sourcemap: false,
    banner: {
      js: `/* ChatbotHub Widget v1.0.0 — https://github.com/chatbot-ai-hub */`,
    },
  });

  // Production build — minified
  const result = await esbuild.build({
    ...sharedOptions,
    outfile: 'dist/widget.min.js',
    minify: true,
    sourcemap: false,
    metafile: true,
    banner: {
      js: `/* ChatbotHub Widget v1.0.0 */`,
    },
  });

  const text = await esbuild.analyzeMetafile(result.metafile);
  console.log(text);
  console.log('✅  Build complete: dist/widget.js + dist/widget.min.js');
}

if (isWatch) {
  const ctx = await esbuild.context({
    ...sharedOptions,
    outfile: 'dist/widget.js',
    minify: false,
    sourcemap: true,
    banner: {
      js: `/* ChatbotHub Widget — DEV BUILD */`,
    },
    plugins: [
      {
        name: 'watch-logger',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error('❌ Build failed:', result.errors);
            } else {
              console.log(`[${new Date().toLocaleTimeString()}] ✅ Rebuilt dist/widget.js`);
            }
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log('👀 Watching for changes...');
} else {
  build().catch(() => process.exit(1));
}
