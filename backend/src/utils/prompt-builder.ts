export interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  priority?: number | null;
  isActive?: boolean | null;
}

export function buildSystemPrompt(
  botPrompt: string,
  knowledgeBases: KnowledgeEntry[],
): string {
  const active = knowledgeBases.filter((kb) => kb.isActive !== false);

  if (active.length === 0) {
    return `${botPrompt}

---
INSTRUKSI TAMBAHAN:
- Jawab hanya berdasarkan informasi yang kamu ketahui tentang toko ini.
- Jika tidak tahu, arahkan pelanggan ke admin/CS.
- Gunakan bahasa yang sopan dan ramah.
- Jawab dalam Bahasa Indonesia kecuali pelanggan menggunakan bahasa lain.`.trim();
  }

  const knowledgeSection = [...active]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .map((kb) => `## ${kb.title}\n${kb.content}`)
    .join('\n\n');

  return `${botPrompt}

---
INFORMASI YANG KAMU KETAHUI:
${knowledgeSection}
---

INSTRUKSI TAMBAHAN:
- Jawab hanya berdasarkan informasi di atas.
- Jika tidak tahu, arahkan pelanggan ke admin/CS.
- Gunakan bahasa yang sopan dan ramah.
- Jawab dalam Bahasa Indonesia kecuali pelanggan menggunakan bahasa lain.`.trim();
}
