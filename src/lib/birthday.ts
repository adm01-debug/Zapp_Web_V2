/**
 * HZ-28 (paridade V3->V2, doc 26): a RPC segura `get_team_birthdays` devolve SO o dia e o
 * mes do aniversario — o ano nao chega ao front. Por isso aqui se trabalha com
 * `{ day, month }` e a idade nao existe em lugar nenhum: nao ha o que mostrar nem o que
 * recalcular.
 */
export interface MemberBirthday {
  day: number;
  month: number;
}

export interface BirthdayInfo {
  /** Proximo aniversario: o dia/mes do perfil no ano corrente, ou no seguinte se ja passou. */
  date: Date;
  day: number;
  month: number;
  isToday: boolean;
  daysUntil: number;
}

/**
 * Aniversario sem ano: devolve o proximo aniversario (data do ano corrente ou do seguinte) e
 * quantos dias faltam. Devolve `null` quando o perfil nao tem aniversario cadastrado.
 */
export function getBirthdayInfo(birthday: MemberBirthday | null): BirthdayInfo | null {
  if (!birthday) return null;
  const today = new Date();
  const hoje = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let date = new Date(today.getFullYear(), birthday.month - 1, birthday.day);
  if (date < hoje) date = new Date(today.getFullYear() + 1, birthday.month - 1, birthday.day);
  const isToday = date.getTime() === hoje.getTime();
  const daysUntil = Math.round((date.getTime() - hoje.getTime()) / 86_400_000);
  return { date, day: birthday.day, month: birthday.month, isToday, daysUntil };
}
