-- 時給0円を許容する(経営者が現場ヘルプで入る場合など、無給勤務の記録用途)
alter table public.wage_rates drop constraint wage_rates_hourly_wage_check;
alter table public.wage_rates add constraint wage_rates_hourly_wage_check check (hourly_wage >= 0);
