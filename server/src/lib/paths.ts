/**
 * 判定一个请求路径是否属于 /api 命名空间。
 *
 * 必须同时匹配 '/api' 与 '/api/...'：
 * 只判断 startsWith('/api/') 会把 '/api' 本身漏掉，导致它被 SPA 回退吃掉，
 * 返回 index.html；前端拿到 HTML 再 JSON.parse 就报
 * "Unexpected token '<', \"<!doctype \"... is not valid JSON"，
 * 这类错误现场的 URL 与代码位置对不上，排查成本很高。
 */
export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}
