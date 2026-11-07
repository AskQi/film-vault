/**
 * 标签打印：Code 128 SVG。
 *
 * 编码恒 7 字符 → 条码宽度恒定 → 标签版式完全可预测。
 * Code Set B 含小写，KG2Ta07 这类编码与全数字编码等宽。
 */
import type { FastifyPluginAsync } from 'fastify'
import { inArray } from 'drizzle-orm'
import bwipjs from 'bwip-js'
import { roll, filmStock } from '../db/schema/index.js'
import { eq, and, isNull } from 'drizzle-orm'

/** 标签模板：单位 mm，供前端排版 */
const TEMPLATES = {
  'thermal-40x12': { name: '热敏 40×12mm', widthMm: 40, heightMm: 12, perRow: 1 },
  'thermal-50x15': { name: '热敏 50×15mm', widthMm: 50, heightMm: 15, perRow: 1 },
  'a4-3x8': { name: 'A4 不干胶 3×8', widthMm: 63.5, heightMm: 33.9, perRow: 3 },
} as const

type TemplateKey = keyof typeof TEMPLATES

export const labelRoutes: FastifyPluginAsync = async (app) => {
  // 已建档胶卷的标签（SVG）
  app.get('/', async (req, reply) => {
    const q = req.query as { rollIds?: string; template?: string; scale?: string }
    const ids = (q.rollIds ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)

    if (ids.length === 0) return reply.code(400).send({ error: '请指定 rollIds' })
    if (ids.length > 100) return reply.code(400).send({ error: '单次最多 100 张' })

    const template = (q.template ?? 'thermal-40x12') as TemplateKey
    if (!TEMPLATES[template]) return reply.code(400).send({ error: '未知模板' })

    const scale = Math.min(4, Math.max(1, Number(q.scale ?? 2)))

    const rows = app.db
      .select({ id: roll.id, code: roll.code, name: filmStock.name })
      .from(roll)
      .innerJoin(filmStock, eq(roll.stockId, filmStock.id))
      .where(and(inArray(roll.id, ids), isNull(roll.deletedAt)))
      .all()

    if (rows.length === 0) return reply.code(404).send({ error: '未找到胶卷' })

    const labels = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      svg: renderCode128Svg(r.code, scale),
    }))

    return { template: { key: template, ...TEMPLATES[template] }, labels }
  })

  // 编码预览（未建档也能出图）
  app.get('/preview/:code', async (req, reply) => {
    const code = (req.params as { code: string }).code
    if (!/^[A-Za-z0-9]{7}$/.test(code)) {
      return reply.code(400).send({ error: '编码必须是 7 位字母数字' })
    }
    reply.type('image/svg+xml')
    return renderCode128Svg(code, 2)
  })
}

/**
 * 生成 Code 128 SVG 字符串。
 * bwip-js 的 toSVG 返回 Buffer；这里转成字符串便于前端直接插入 DOM。
 */
export function renderCode128Svg(text: string, scale = 2): string {
  const buf = bwipjs.toSVG({
    bcid: 'code128',
    text,
    scale,
    height: 8, // mm
    includetext: true,
    textxalign: 'center',
    textsize: 8,
    paddingwidth: 1,
    paddingheight: 1,
  })
  return buf.toString()
}
