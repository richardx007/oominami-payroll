import { Splash } from "../Splash";

// 画面遷移中の即時フィードバック(空白防止・連打防止)。
// 起動直後は上位の src/app/loading.tsx(スプラッシュ)に続けてこれが出ることが
// あるため、見た目を揃えて白飛び・チラつきが起きないようにしている。
export default function EmployeeLoading() {
  return <Splash variant="panel" />;
}
