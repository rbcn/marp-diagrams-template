// marp.config.js
//
// Presentation as Code (PaC) 向け Marp 設定
// --------------------------------------------------
// ・themes/pac.css をテーマとして使用
// ・Mermaid フェンスは生成済み SVG として扱う（preprocess.mjs側で変換）
// ・ライブプレビュー用に minimal な Mermaid ESM（必要時のみ）
// --------------------------------------------------

module.exports = {
  // ローカルの画像などを利用するため
  allowLocalFiles: true,

  // HTML を有効にする（Mermaid ESM 注入に必要）
  html: true,

  // テーマの読み込み
  themeSet: ["./themes/pac.css"],
  options: {
    theme: "pac",
  },

  // Live Preview のときだけ挿入される HTML スニペット
  // （dist/*.marp.md → browser で見る場合など）
  // 生成済みSVGを貼る運用なので、MermaidJSはほぼ不要だが
  // Preview互換のため必要最低限だけ保持
  htmlAsArray: [
    `<style>.mermaid{width:100%;background:none}</style>`,
    `<script type="module">
      // Mermaid ESM 読み込み（ライブプレビュー用）
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

      // コードブロックを差し替えて mermaid.js に食わせる
      const blocks = document.querySelectorAll('pre code.language-mermaid');
      for (const code of blocks) {
        const pre = code.parentElement;
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = code.textContent;
        pre.replaceWith(div);
      }

      mermaid.initialize({ startOnLoad: true });
    </script>`
  ],
};
