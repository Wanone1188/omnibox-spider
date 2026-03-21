// @name 爱奇艺资源站(MacCMS API)
// @author OpenClaw Bingbu
// @description 刮削：不支持，弹幕：不支持，嗅探：支持
// @dependencies: axios
// @version 1.0.0
// @downloadURL https://gh-proxy.org/https://github.com/Silent1566/OmniBox-Spider/raw/refs/heads/main/影视/采集/爱奇艺资源站.js

/**
 * ============================================================================
 * 爱奇艺资源站 OmniBox 站源
 * 站点: https://iqiyizyapi.com
 * 接口: /api.php/provide/vod
 *
 * 本版增强：
 * - 一级分类固定为：电影/连续剧/综艺/动漫/伦理片
 * - 二级分类进入筛选项，不直接堆在一级
 * - 支持分类屏蔽，默认屏蔽：伦理片(39)
 *
 * 分类屏蔽配置：
 * - 环境变量 IQIYIZY_BLOCKED_MAIN
 * - 例："39" 或 "39,9"（按一级分类ID）
 * ============================================================================
 */

const axios = require("axios");

const HOST = "https://iqiyizyapi.com";
const API = `${HOST}/api.php/provide/vod`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

// 一级主类映射（按站点导航主类ID）
const MAIN_CATEGORIES = [
  { type_id: "7", type_name: "电影" },
  { type_id: "8", type_name: "连续剧" },
  { type_id: "9", type_name: "综艺" },
  { type_id: "40", type_name: "动漫" },
  { type_id: "39", type_name: "伦理片" }
];

// 主类子分类兜底（用于 category 直调时分类缓存缺失场景）
const MAIN_CHILDREN_FALLBACK = {
  "7": [
    { type_id: "5", type_name: "动漫电影" },
    { type_id: "10", type_name: "动作片" },
    { type_id: "11", type_name: "喜剧片" },
    { type_id: "12", type_name: "爱情片" },
    { type_id: "13", type_name: "科幻片" },
    { type_id: "14", type_name: "恐怖片" },
    { type_id: "15", type_name: "剧情片" },
    { type_id: "16", type_name: "战争片" },
    { type_id: "17", type_name: "惊悚片" },
    { type_id: "18", type_name: "家庭片" },
    { type_id: "19", type_name: "古装片" },
    { type_id: "20", type_name: "历史片" },
    { type_id: "21", type_name: "悬疑片" },
    { type_id: "22", type_name: "犯罪片" },
    { type_id: "23", type_name: "灾难片" },
    { type_id: "24", type_name: "记录片" },
    { type_id: "25", type_name: "短片" }
  ],
  "8": [
    { type_id: "26", type_name: "国产剧" },
    { type_id: "27", type_name: "香港剧" },
    { type_id: "28", type_name: "韩国剧" },
    { type_id: "29", type_name: "欧美剧" },
    { type_id: "30", type_name: "台湾剧" },
    { type_id: "31", type_name: "日本剧" },
    { type_id: "32", type_name: "海外剧" },
    { type_id: "33", type_name: "泰国剧" },
    { type_id: "38", type_name: "短剧" }
  ],
  "9": [
    { type_id: "34", type_name: "大陆综艺" },
    { type_id: "35", type_name: "港台综艺" },
    { type_id: "36", type_name: "日韩综艺" },
    { type_id: "37", type_name: "欧美综艺" }
  ],
  "40": [
    { type_id: "1", type_name: "国产动漫" },
    { type_id: "2", type_name: "日韩动漫" },
    { type_id: "3", type_name: "欧美动漫" },
    { type_id: "4", type_name: "港台动漫" },
    { type_id: "6", type_name: "里番动漫" }
  ],
  "39": []
};

// 默认屏蔽：伦理片（可由环境变量覆盖）
const DEFAULT_BLOCKED_MAIN = ["39"];

const http = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": UA,
    "Accept": "application/json,text/plain,*/*",
    "Referer": `${HOST}/`
  },
  validateStatus: () => true
});

const CLASS_CACHE = {
  list: [],
  mapById: {},
  childMap: {}
};

function safeJson(input, fallback = {}) {
  if (!input) return fallback;
  if (typeof input === "object") return input;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function text(v) {
  return String(v == null ? "" : v).trim();
}

function fixUrl(url) {
  const u = text(url);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `${HOST}${u}`;
  return `${HOST}/${u}`;
}

function b64Encode(obj) {
  try {
    return Buffer.from(JSON.stringify(obj || {}), "utf8").toString("base64");
  } catch {
    return "";
  }
}

function b64Decode(str) {
  try {
    return JSON.parse(Buffer.from(String(str || ""), "base64").toString("utf8"));
  } catch {
    return {};
  }
}

function getBlockedMainSet() {
  const env = text(process.env.IQIYIZY_BLOCKED_MAIN);
  const raw = env
    ? env.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_BLOCKED_MAIN;
  return new Set(raw);
}

function updateClassCache(classList) {
  const classes = Array.isArray(classList)
    ? classList.map((c) => ({
        type_id: text(c.type_id),
        type_pid: text(c.type_pid),
        type_name: text(c.type_name)
      })).filter((c) => c.type_id && c.type_name)
    : [];

  if (!classes.length) return;

  const mapById = {};
  const childMap = {};
  classes.forEach((c) => {
    mapById[c.type_id] = c;
    const pid = c.type_pid || "0";
    if (!childMap[pid]) childMap[pid] = [];
    childMap[pid].push(c);
  });

  CLASS_CACHE.list = classes;
  CLASS_CACHE.mapById = mapById;
  CLASS_CACHE.childMap = childMap;
}

async function fetchApi(params = {}) {
  try {
    const res = await http.get(API, { params });
    const data = safeJson(res.data, {});
    if (Array.isArray(data.class)) updateClassCache(data.class);
    return data;
  } catch {
    return {};
  }
}

async function ensureClassCache() {
  if (Array.isArray(CLASS_CACHE.list) && CLASS_CACHE.list.length > 0) return;
  // 关键：支持 category() 直调自举，不依赖先跑 home/search
  await fetchApi({ ac: "list", pg: 1 });
}

function resolveMainTypeId(typeId, fallbackMain = "") {
  const t = text(typeId);
  if (!t) return text(fallbackMain);
  if (MAIN_CATEGORIES.some((m) => m.type_id === t)) return t;

  const mapById = CLASS_CACHE.mapById || {};
  let cur = mapById[t];
  let guard = 0;
  while (cur && guard < 10) {
    guard += 1;
    if (MAIN_CATEGORIES.some((m) => m.type_id === cur.type_id)) return cur.type_id;
    if (!cur.type_pid || cur.type_pid === cur.type_id) break;
    cur = mapById[cur.type_pid];
  }

  return text(fallbackMain);
}

function isMainBlocked(mainTypeId) {
  const blocked = getBlockedMainSet();
  return blocked.has(text(mainTypeId));
}

function mapListItem(item) {
  const typeId = text(item.type_id || "");
  const mainTypeId = resolveMainTypeId(typeId, item.type_id_1 || "");

  return {
    vod_id: text(item.vod_id),
    vod_name: text(item.vod_name),
    vod_pic: fixUrl(item.vod_pic),
    vod_remarks: text(item.vod_remarks || item.type_name || ""),
    type_id: typeId,
    type_name: text(item.type_name || ""),
    main_type_id: mainTypeId
  };
}

function parsePlaySources(vodPlayFrom, vodPlayUrl, vodName = "") {
  const fromArr = text(vodPlayFrom).split("$$$").map((s) => s.trim()).filter(Boolean);
  const urlArr = text(vodPlayUrl).split("$$$").map((s) => s.trim()).filter(Boolean);

  const sourceCount = Math.max(fromArr.length, urlArr.length);
  const sources = [];

  for (let i = 0; i < sourceCount; i += 1) {
    const flag = fromArr[i] || `线路${i + 1}`;
    const group = urlArr[i] || "";
    const episodesRaw = group.split("#").map((s) => s.trim()).filter(Boolean);

    const episodes = episodesRaw.map((item, idx) => {
      let epName = `第${idx + 1}集`;
      let epUrl = item;

      const cut = item.indexOf("$");
      if (cut > -1) {
        epName = text(item.slice(0, cut)) || epName;
        epUrl = text(item.slice(cut + 1));
      }

      const playId = b64Encode({
        name: vodName,
        flag,
        epName,
        url: epUrl
      });

      return { name: epName, playId };
    });

    if (episodes.length > 0) {
      sources.push({ name: flag, episodes });
    }
  }

  return sources;
}

function buildMainClasses() {
  return MAIN_CATEGORIES.filter((c) => !isMainBlocked(c.type_id));
}

function buildFiltersForMain(mainTypeId) {
  const key = text(mainTypeId);
  const cacheChildren = (CLASS_CACHE.childMap?.[key] || [])
    .filter((c) => c.type_id !== key)
    .map((c) => ({ type_id: c.type_id, type_name: c.type_name }));
  const children = (cacheChildren.length ? cacheChildren : (MAIN_CHILDREN_FALLBACK[key] || []))
    .sort((a, b) => String(a.type_id).localeCompare(String(b.type_id)));

  if (!children.length) return [];

  return [
    {
      key: "subtype",
      name: "子分类",
      init: "",
      value: [
        { name: "全部", value: "" },
        ...children.map((c) => ({ name: c.type_name, value: c.type_id }))
      ]
    }
  ];
}

function getChildTypeIds(mainTypeId) {
  const key = text(mainTypeId);
  const cacheChildren = (CLASS_CACHE.childMap?.[key] || [])
    .filter((c) => c.type_id && c.type_id !== key)
    .map((c) => c.type_id);
  if (cacheChildren.length) return cacheChildren;
  return (MAIN_CHILDREN_FALLBACK[key] || []).map((c) => c.type_id);
}

async function fetchMainAllByChildren(mainTypeId, page) {
  const childTypeIds = getChildTypeIds(mainTypeId);
  if (!childTypeIds.length) {
    // 无子类时回退主类直查（如 39 伦理片）
    const direct = await fetchApi({ ac: "list", t: text(mainTypeId), pg: page });
    const directList = (Array.isArray(direct.list) ? direct.list : [])
      .map(mapListItem)
      .filter((it) => !isMainBlocked(it.main_type_id || it.type_id));

    return {
      list: directList,
      page: Number(direct.page || page || 1),
      pagecount: Number(direct.pagecount || page || 1),
      total: Number(direct.total || directList.length || 0),
      limit: Number(direct.limit || 20)
    };
  }

  const results = await Promise.all(
    childTypeIds.map((tid) => fetchApi({ ac: "list", t: tid, pg: page }))
  );

  const mergedRaw = [];
  let total = 0;
  let pagecount = 0;
  let limit = 20;

  results.forEach((data) => {
    const arr = Array.isArray(data.list) ? data.list : [];
    mergedRaw.push(...arr);
    total += Number(data.total || 0);
    pagecount = Math.max(pagecount, Number(data.pagecount || 0));
    if (Number(data.limit || 0) > 0) limit = Number(data.limit);
  });

  // 去重并按ID倒序，尽量贴近站点“最新在前”的观感
  const seen = new Set();
  const merged = mergedRaw
    .map(mapListItem)
    .filter((it) => !isMainBlocked(it.main_type_id || it.type_id))
    .filter((it) => {
      if (!it.vod_id || seen.has(it.vod_id)) return false;
      seen.add(it.vod_id);
      return true;
    })
    .sort((a, b) => Number(b.vod_id || 0) - Number(a.vod_id || 0));

  return {
    list: merged,
    page,
    pagecount: pagecount || page,
    total: total || merged.length,
    limit
  };
}

function getFilterSubtype(params) {
  // 兼容不同宿主透传结构：filters / filter / extend / ext
  return text(
    params?.filters?.subtype
    || params?.filter?.subtype
    || params?.extend?.subtype
    || params?.ext?.subtype
    || ""
  );
}

function isAllSelection(value) {
  const v = text(value).toLowerCase();
  return !v || v === "0" || v === "-1" || v === "all" || v === "全部";
}

async function home() {
  const data = await fetchApi({ ac: "list", pg: 1 });
  const classes = buildMainClasses();

  const list = (Array.isArray(data.list) ? data.list : [])
    .map(mapListItem)
    .filter((it) => !isMainBlocked(it.main_type_id || it.type_id));

  const filters = {};
  classes.forEach((m) => {
    const f = buildFiltersForMain(m.type_id);
    if (f.length) filters[m.type_id] = f;
  });

  return {
    class: classes,
    filters,
    list
  };
}

async function category(params) {
  const page = parseInt(params?.page || "1", 10) || 1;
  const mainTypeId = text(params?.categoryId || params?.type_id || "");
  const subtype = getFilterSubtype(params);

  // 自举分类缓存，保障 category 直调可用
  await ensureClassCache();

  // 一级被屏蔽，直接返回空
  if (isMainBlocked(mainTypeId)) {
    return { list: [], page, pagecount: 0, total: 0, limit: 20 };
  }

  let result;

  if (!isAllSelection(subtype)) {
    // 选中了具体二级分类
    const data = await fetchApi({ ac: "list", t: subtype, pg: page });
    const list = (Array.isArray(data.list) ? data.list : [])
      .map(mapListItem)
      .filter((it) => !isMainBlocked(it.main_type_id || it.type_id));

    result = {
      list,
      page: Number(data.page || page || 1),
      pagecount: Number(data.pagecount || page || 1),
      total: Number(data.total || list.length || 0),
      limit: Number(data.limit || 20)
    };
  } else {
    // 二级“全部”与一级“全部”统一走主类聚合
    result = await fetchMainAllByChildren(mainTypeId, page);
  }

  const f = buildFiltersForMain(mainTypeId);
  if (f.length && page === 1) result.filters = f;

  return result;
}

async function search(params) {
  const keyword = text(params?.keyword || params?.wd || "");
  const page = parseInt(params?.page || "1", 10) || 1;
  if (!keyword) return { list: [], page: 1, pagecount: 0, total: 0 };

  const data = await fetchApi({ ac: "list", wd: keyword, pg: page });
  const list = (Array.isArray(data.list) ? data.list : [])
    .map(mapListItem)
    .filter((it) => !isMainBlocked(it.main_type_id || it.type_id));

  return {
    list,
    page: Number(data.page || page || 1),
    pagecount: Number(data.pagecount || page || 1),
    total: Number(data.total || list.length || 0),
    limit: Number(data.limit || 20)
  };
}

async function detail(params) {
  const videoId = text(params?.videoId || "");
  if (!videoId) return { list: [] };

  const data = await fetchApi({ ac: "detail", ids: videoId });
  const item = Array.isArray(data.list) && data.list.length ? data.list[0] : null;
  if (!item) return { list: [] };

  const mainTypeId = resolveMainTypeId(item.type_id, item.type_id_1 || "");
  if (isMainBlocked(mainTypeId)) return { list: [] };

  const playSources = parsePlaySources(item.vod_play_from, item.vod_play_url, item.vod_name);

  const vod = {
    vod_id: text(item.vod_id),
    vod_name: text(item.vod_name),
    vod_pic: fixUrl(item.vod_pic),
    vod_remarks: text(item.vod_remarks),
    vod_year: text(item.vod_year),
    vod_area: text(item.vod_area),
    vod_lang: text(item.vod_lang),
    vod_director: text(item.vod_director),
    vod_actor: text(item.vod_actor),
    vod_class: text(item.vod_class || item.type_name || ""),
    vod_content: text(item.vod_content).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    vod_play_sources: playSources
  };

  return { list: [vod] };
}

async function play(params) {
  const playId = text(params?.playId || "");
  const meta = b64Decode(playId);
  const url = fixUrl(meta.url || "");

  if (!url) {
    return {
      urls: [],
      parse: 1,
      header: {
        "User-Agent": UA,
        "Referer": `${HOST}/`
      }
    };
  }

  return {
    urls: [{ name: meta.epName || meta.flag || "播放", url }],
    parse: 0,
    header: {
      "User-Agent": UA,
      "Referer": `${HOST}/`
    }
  };
}

module.exports = { home, category, search, detail, play };

const runner = require("spider_runner");
runner.run(module.exports);
