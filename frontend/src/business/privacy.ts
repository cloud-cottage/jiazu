/**
 * 在世人物隐私脱敏
 *
 * 规则（来自 IDEA.md §9）:
 * - 已故人物：完整公开
 * - 在世人物：仅展示姓名；隐藏生日、出生地、配偶完整信息、联系方式
 */

import type { PersonDetail, PersonSummary } from './types';

export function isLiving(person: PersonSummary | PersonDetail): boolean {
  return person.is_living === true;
}

export function sanitizePerson<T extends PersonSummary | PersonDetail>(person: T): T {
  if (!isLiving(person)) return person;

  const sanitized = { ...person };

  // 清除生日
  if ('birth_date' in sanitized) {
    (sanitized as PersonSummary).birth_date = '****-**-**';
  }
  if ('death_date' in sanitized) {
    (sanitized as PersonSummary).death_date = undefined;
  }

  // 清除事件中的敏感地点
  if ('events' in sanitized) {
    const detail = sanitized as PersonDetail;
    detail.events = detail.events.map((evt) => {
      if (evt.type === 'Birth') {
        return { ...evt, place: '***', date: '****-**-**' };
      }
      return evt;
    });
  }

  // 清除配偶详情
  if ('families' in sanitized) {
    const detail = sanitized as PersonDetail;
    detail.families = detail.families.map((fam) => ({
      ...fam,
      father: fam.father ? maskLivingPerson(fam.father) : fam.father,
      mother: fam.mother ? maskLivingPerson(fam.mother) : fam.mother,
      children: fam.children.map((c) =>
        isLiving(c) ? maskLivingPerson(c) : c,
      ),
    }));
  }

  return sanitized;
}

function maskLivingPerson(p: PersonSummary): PersonSummary {
  return {
    ...p,
    birth_date: '****-**-**',
    death_date: undefined,
  };
}
