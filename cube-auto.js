// cube-auto.js
(function () {
  let autoRunning = false;
  let autoTimer = null;

  function isWeaponSelected() {
    return typeof getSelectedPartsType === "function" && getSelectedPartsType() === 1;
  }

  function getMainStat() {
    if (typeof getSelectedMainStat === "function") {
      return getSelectedMainStat();
    }
    return "STR";
  }

  // candLines: rollOneSet으로 나온 3줄짜리 배열
  // 👉 세 줄에 포함된 공격력/마력 %를 모두 합산
  function getTotalAtkPercentInSet(candLines, mainStat) {
    if (!candLines) return 0;
    const isInt = mainStat === "INT";
    const keyword = isInt ? "마력" : "공격력";
    let sum = 0;
    for (const line of candLines) {
      const text = line.optionText || "";
      if (!text.includes(keyword)) continue;
      const m = text.match(/\+(\d+)%/);
      if (!m) continue;
      const val = parseInt(m[1], 10);
      if (!isNaN(val)) sum += val;
    }
    return sum;
  }

  // 현재 rollCandidates 3개 중 어느 하나라도
  // 공격력/마력 % 합계가 targetPercent 이상이면 true
  function hasSatisfiedCandidate(targetPercent) {
    if (!Array.isArray(rollCandidates)) return false;
    const mainStat = getMainStat();
    for (const cand of rollCandidates) {
      const total = getTotalAtkPercentInSet(cand, mainStat);
      if (total >= targetPercent) {
        return true;
      }
    }
    return false;
  }

  function updateAutoButton(running) {
    const btn = document.getElementById("autoRollBtn");
    if (!btn) return;
    btn.textContent = running ? "자동 돌리기 정지" : "자동 돌리기 시작";
    // 무기 아니면 시작 불가 (진행 중일 때는 정지 가능해야 하니 running 고려)
    btn.disabled = !isWeaponSelected() && !running;
    btn.style.opacity = (!isWeaponSelected() && !running) ? 0.5 : 1;
  }

  function refreshWeaponAutoVisibility() {
    const container = document.getElementById("weaponAutoContainer");
    const isWeapon = isWeaponSelected();
    if (container) {
      container.style.display = isWeapon ? "block" : "none";
    }
    if (!isWeapon) {
      stopAuto();
    }
    updateAutoButton(autoRunning);
  }

  function autoStep(targetPercent) {
    if (!autoRunning) return;
    if (!isWeaponSelected()) {
      stopAuto();
      return;
    }

    // 한 번 세트 롤
    if (typeof doOneRollStep === "function") {
      doOneRollStep();
    }

    // 3줄 합산한 %가 목표 이상인 세트가 하나라도 있으면 종료
    if (hasSatisfiedCandidate(targetPercent)) {
      stopAuto();
      return;
    }

    // 다시 반복
    autoTimer = setTimeout(() => autoStep(targetPercent), 0);
  }

  function startAuto() {
    if (autoRunning) return;
    if (!isWeaponSelected()) {
      alert("자동 돌리기는 무기 부위에서만 사용할 수 있습니다.");
      return;
    }

    const targetInput = document.getElementById("weaponAutoTarget");
    if (!targetInput) {
      alert("자동 돌리기 목표 % 입력칸을 찾을 수 없습니다.");
      return;
    }
    const targetPercent = Number(targetInput.value);
    if (!targetPercent || targetPercent <= 0) {
      alert("올바른 목표 %를 입력해주세요.");
      return;
    }

    autoRunning = true;
    updateAutoButton(true);
    autoStep(targetPercent);
  }

  function stopAuto() {
    autoRunning = false;
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    updateAutoButton(false);
  }

  // DOM 준비 후 이벤트 연결
  window.addEventListener("DOMContentLoaded", () => {
    const autoBtn = document.getElementById("autoRollBtn");
    if (autoBtn) {
      autoBtn.addEventListener("click", () => {
        if (autoRunning) {
          stopAuto();
        } else {
          startAuto();
        }
      });
    }

    const partsSelect = document.getElementById("partsType");
    if (partsSelect) {
      partsSelect.addEventListener("change", refreshWeaponAutoVisibility);
    }

    // 초기 상태 세팅
    refreshWeaponAutoVisibility();
  });

})();
