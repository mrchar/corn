module.exports = {
  presets: [
    // modules: false 保留 ESM 语法，配合 Jest --experimental-vm-modules 原生加载
    ['@babel/preset-env', { targets: { node: 'current' }, modules: false }],
    '@babel/preset-typescript',
  ],
  plugins: [
    'babel-plugin-transform-typescript-metadata',
    ['@babel/plugin-proposal-decorators', { version: 'legacy' }],
    '@babel/plugin-transform-class-properties',
  ],
  assumptions: { setPublicClassFields: true },
};
