import { Splash } from "../Splash";

// 画面遷移中に即座に表示されるローディング。サーバーでのデータ取得を待つ間、
// 空白のままにせずロゴを出すことで「タップが効いていない」誤解と連打を防ぐ。
// 起動直後は上位の src/app/loading.tsx(スプラッシュ)に続けてこれが出ることが
// あるため、見た目を揃えて白飛び・チラつきが起きないようにしている。
export default function AdminLoading() {
  return <Splash variant="panel" />;
}
