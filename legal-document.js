(() => {
  const page = document.querySelector("[data-legal-document-page]");

  if (!page) {
    return;
  }

  const documentRoot = page.querySelector("[data-legal-document]");
  const summaryRoot = page.querySelector("[data-legal-summary]");
  const sourcePath = page.dataset.docSrc;
  const pdfPath = page.dataset.docPdf;

  const escapeHtml = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const pageMarkerPattern =
    /^(?:LECO(?:\s*-\s*.+?)?\s+P[aá]gina\s+\d+|--\s*\d+\s+of\s+\d+\s*--)$/i;
  const headingPattern = /^\d+(?:\.\d+)*\.\s+/;
  const bulletPattern = /^(?:l|-)\s+/;
  const metaPattern =
    /^(Empresa|CNPJ|Versão|Atualização|Contato|Privacidade|Canal de suporte|Canal de privacidade|Endereço para contato)\s*:?\s*(.*)$/i;

  function normalizeText(text) {
    return text
      .replace(/\r/g, "")
      .replace(/:\s+-\s+/g, ":\n- ")
      .replace(/\n{3,}/g, "\n\n");
  }

  function isHeading(line) {
    return headingPattern.test(line);
  }

  function isBullet(line) {
    return bulletPattern.test(line);
  }

  function isTitleLike(line) {
    const cleaned = line.trim();
    const lettersOnly = cleaned.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    const uppercaseLetters = lettersOnly.replace(/[^A-ZÀ-ÖØ-Þ]/g, "");

    return (
      cleaned &&
      cleaned.length <= 140 &&
      lettersOnly.length >= 8 &&
      uppercaseLetters.length >= lettersOnly.length * 0.7 &&
      !metaPattern.test(cleaned) &&
      !/^Resumo prático:/i.test(cleaned)
    );
  }

  function formatMetaLabel(label) {
    const normalized = label.trim().toLowerCase();

    if (normalized === "cnpj") return "CNPJ";
    if (normalized === "versão") return "Versão";
    if (normalized === "atualização") return "Atualização";
    if (normalized === "contato") return "Contato";
    if (normalized === "privacidade") return "Privacidade";
    if (normalized === "empresa") return "Empresa";
    if (normalized === "última atualização") return "Última atualização";
    if (normalized === "canal de suporte") return "Canal de suporte";
    if (normalized === "canal de privacidade") return "Canal de privacidade";
    if (normalized === "endereço para contato") return "Endereço para contato";

    return label;
  }

  function cleanLines(rawText) {
    return normalizeText(rawText)
      .split("\n")
      .map((line) => line.trimRight())
      .filter((line) => !pageMarkerPattern.test(line.trim()));
  }

  function parsePrelude(lines) {
    const meta = [];
    const descriptions = [];
    let summary = "";

    for (let index = 0; index < lines.length; ) {
      const rawLine = lines[index].trim();

      if (!rawLine || isTitleLike(rawLine)) {
        index += 1;
        continue;
      }

      if (/^Última atualização:/i.test(rawLine)) {
        rawLine
          .split("•")
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) => {
            if (/^Versão\s+/i.test(part)) {
              meta.push({
                label: "Versão",
                value: part.replace(/^Versão\s+/i, "").trim(),
              });
              return;
            }

            const [label, ...valueParts] = part.split(":");
            meta.push({
              label: formatMetaLabel(label),
              value: valueParts.join(":").trim(),
            });
          });
        index += 1;
        continue;
      }

      const metaMatch = rawLine.match(metaPattern);

      if (metaMatch) {
        let value = metaMatch[2].trim();
        index += 1;

        while (index < lines.length) {
          const continuation = lines[index].trim();

          if (
            !continuation ||
            isTitleLike(continuation) ||
            /^Resumo prático:/i.test(continuation) ||
            metaPattern.test(continuation)
          ) {
            break;
          }

          value = `${value} ${continuation}`.trim();
          index += 1;
        }

        meta.push({
          label: formatMetaLabel(metaMatch[1]),
          value,
        });
        continue;
      }

      if (/^Resumo prático:/i.test(rawLine)) {
        let value = rawLine.replace(/^Resumo prático:\s*/i, "").trim();
        index += 1;

        while (index < lines.length) {
          const continuation = lines[index].trim();

          if (!continuation || isTitleLike(continuation) || metaPattern.test(continuation)) {
            break;
          }

          value = `${value} ${continuation}`.trim();
          index += 1;
        }

        summary = value;
        continue;
      }

      let paragraph = rawLine;
      index += 1;

      while (index < lines.length) {
        const continuation = lines[index].trim();

        if (
          !continuation ||
          isTitleLike(continuation) ||
          metaPattern.test(continuation) ||
          /^Resumo prático:/i.test(continuation)
        ) {
          break;
        }

        paragraph = `${paragraph} ${continuation}`.trim();
        index += 1;
      }

      descriptions.push(paragraph);
    }

    return { meta, descriptions, summary };
  }

  function parseBlocks(lines) {
    const blocks = [];

    for (let index = 0; index < lines.length; ) {
      const currentLine = lines[index].trim();

      if (!currentLine) {
        index += 1;
        continue;
      }

      if (isHeading(currentLine)) {
        const depth = (currentLine.match(/\./g) || []).length;
        blocks.push({
          type: "heading",
          level: depth >= 2 ? 3 : 2,
          text: currentLine,
        });
        index += 1;
        continue;
      }

      if (isBullet(currentLine)) {
        const items = [];
        let currentItem = "";

        while (index < lines.length) {
          const listLine = lines[index].trim();

          if (!listLine) {
            index += 1;

            let nextIndex = index;
            while (nextIndex < lines.length && !lines[nextIndex].trim()) {
              nextIndex += 1;
            }

            if (nextIndex < lines.length && isBullet(lines[nextIndex].trim())) {
              continue;
            }

            break;
          }

          if (isHeading(listLine)) {
            break;
          }

          if (isBullet(listLine)) {
            if (currentItem) {
              items.push(currentItem);
            }

            currentItem = listLine.replace(bulletPattern, "").trim();
            index += 1;
            continue;
          }

          if (currentItem) {
            currentItem = `${currentItem} ${listLine}`.trim();
            index += 1;
            continue;
          }

          break;
        }

        if (currentItem) {
          items.push(currentItem);
        }

        blocks.push({
          type: "list",
          items,
        });
        continue;
      }

      let paragraph = currentLine;
      index += 1;

      while (index < lines.length) {
        const continuation = lines[index].trim();

        if (!continuation || isHeading(continuation) || isBullet(continuation)) {
          break;
        }

        paragraph = `${paragraph} ${continuation}`.trim();
        index += 1;
      }

      blocks.push({
        type: "paragraph",
        text: paragraph,
      });
    }

    return blocks;
  }

  function renderSummary(summaryData) {
    const descriptionHtml = summaryData.descriptions.length
      ? `<p class="legal-summary-intro">${escapeHtml(
          summaryData.descriptions.join(" ")
        )}</p>`
      : "";

    const highlightHtml = summaryData.summary
      ? `<div class="legal-summary-highlight"><strong>Resumo prático</strong><p>${escapeHtml(
          summaryData.summary
        )}</p></div>`
      : "";

    const metaHtml = summaryData.meta.length
      ? `<dl class="legal-meta-grid">${summaryData.meta
          .map(
            (item) =>
              `<div class="legal-meta-item"><dt>${escapeHtml(
                item.label
              )}</dt><dd>${escapeHtml(item.value)}</dd></div>`
          )
          .join("")}</dl>`
      : "";

    summaryRoot.innerHTML = `
      <div class="legal-summary-pill">Leitura facilitada</div>
      ${descriptionHtml}
      ${highlightHtml}
      ${metaHtml}
      <a href="${escapeHtml(
        pdfPath
      )}" class="legal-action-button secondary legal-summary-link" target="_blank" rel="noopener noreferrer">Ver PDF oficial</a>
    `;
  }

  function renderBlocks(blocks) {
    return blocks
      .map((block) => {
        if (block.type === "heading") {
          const tag = block.level === 3 ? "h3" : "h2";
          return `<${tag}>${escapeHtml(block.text)}</${tag}>`;
        }

        if (block.type === "list") {
          return `<ul>${block.items
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")}</ul>`;
        }

        return `<p>${escapeHtml(block.text)}</p>`;
      })
      .join("");
  }

  async function loadDocument() {
    try {
      const response = await fetch(new URL(sourcePath, window.location.href), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Falha ao carregar o documento.");
      }

      const rawText = await response.text();
      const cleanedLines = cleanLines(rawText);
      const firstHeadingIndex = cleanedLines.findIndex((line) =>
        isHeading(line.trim())
      );
      const preludeLines =
        firstHeadingIndex === -1
          ? cleanedLines.filter((line) => line.trim())
          : cleanedLines.slice(0, firstHeadingIndex).filter((line) => line.trim());
      const bodyLines =
        firstHeadingIndex === -1 ? [] : cleanedLines.slice(firstHeadingIndex);

      renderSummary(parsePrelude(preludeLines));
      documentRoot.innerHTML = renderBlocks(parseBlocks(bodyLines));
    } catch (error) {
      summaryRoot.innerHTML = `
        <div class="legal-summary-pill">Documento oficial</div>
        <p class="legal-summary-intro">Não foi possível carregar a versão em texto agora. Você ainda pode abrir o PDF oficial do documento.</p>
        <a href="${escapeHtml(
          pdfPath
        )}" class="legal-action-button secondary legal-summary-link" target="_blank" rel="noopener noreferrer">Ver PDF oficial</a>
      `;

      documentRoot.innerHTML = `
        <div class="legal-document-error">
          <h2>Conteúdo indisponível no momento</h2>
          <p>Se preferir, use o PDF oficial do documento para consultar o texto completo.</p>
        </div>
      `;
      console.error(error);
    }
  }

  loadDocument();
})();
