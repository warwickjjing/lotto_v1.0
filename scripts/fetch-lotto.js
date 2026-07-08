// scripts/fetch-lotto.js
// 동행복권을 직접 호출하지 않고, GitHub에 공개된 로또 데이터셋(smok95/lotto)을 사용합니다.
// 이 저장소는 GitHub Pages(github.io)로 호스팅되어 있어 GitHub Actions에서
// IP 차단 없이 안정적으로 접근 가능합니다.
// 출처: https://github.com/smok95/lotto (본 정보에는 오류가 있을 수 있음)

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'lotto-history.json');
const LATEST_URL = 'https://smok95.github.io/lotto/results/latest.json';
const ALL_URL = 'https://smok95.github.io/lotto/results/all.json';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`요청 실패 (${url}) - HTTP ${res.status}`);
  }
  return res.json();
}

function normalize(entry) {
  return {
    drwNo: entry.draw_no,
    date: entry.date,
    numbers: entry.numbers,
    bonus: entry.bonus_no,
  };
}

async function main() {
  let history = [];
  if (fs.existsSync(DATA_PATH)) {
    history = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  }

  const lastKnown = history.length ? history[history.length - 1].drwNo : 0;

  const latest = await fetchJson(LATEST_URL);
  console.log(`원본 데이터 최신 회차: ${latest.draw_no}, 로컬 최신 회차: ${lastKnown}`);

  if (latest.draw_no <= lastKnown) {
    console.log('추가할 새 회차 없음');
    return;
  }

  // 로컬에 데이터가 아예 없는 첫 실행이면 전체 데이터를 한 번에 받아옴
  if (history.length === 0) {
    console.log('첫 실행 감지: 전체 회차 데이터를 한 번에 받아옵니다.');
    const all = await fetchJson(ALL_URL);
    history = all.map(normalize).sort((a, b) => a.drwNo - b.drwNo);
  } else {
    // 이후에는 최신 회차만 추가 (일반적으로 매주 1개씩만 늘어남)
    history.push(normalize(latest));
  }

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(history, null, 2));
  console.log(`저장 완료. 총 ${history.length}개 회차, 최신 ${history[history.length - 1].drwNo}회`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
