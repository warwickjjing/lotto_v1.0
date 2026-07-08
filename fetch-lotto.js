// scripts/fetch-lotto.js
// 매주 자동 실행되어, 최신 회차의 당첨번호를 data/lotto-history.json 에 누적 저장합니다.
// 실행 주체는 사용자 자신의 GitHub Actions 워크플로우이며, 동행복권 서버에 대한
// 접근 정책(robots.txt 등)은 실행 전 반드시 다시 한번 직접 확인하시기 바랍니다.

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'lotto-history.json');

async function fetchDraw(drwNo) {
  const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const data = await res.json();
  if (data.returnValue !== 'success') return null;
  return {
    drwNo: data.drwNo,
    date: data.drwNoDate,
    numbers: [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6],
    bonus: data.bnusNo,
  };
}

async function main() {
  let history = [];
  if (fs.existsSync(DATA_PATH)) {
    history = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  }

  const lastKnown = history.length ? history[history.length - 1].drwNo : 0;
  let nextNo = lastKnown + 1;
  let added = 0;

  // 최신 회차까지 순차적으로 조회 (한 번 실행에 최대 10회차까지만, 과도한 요청 방지)
  while (added < 10) {
    const draw = await fetchDraw(nextNo);
    if (!draw) break;
    history.push(draw);
    nextNo++;
    added++;
    await new Promise(r => setTimeout(r, 300)); // 과도한 연속 요청 방지
  }

  if (added > 0) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(history, null, 2));
    console.log(`${added}개 회차 추가됨 (최신: ${nextNo - 1}회)`);
  } else {
    console.log('추가할 새 회차 없음');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
