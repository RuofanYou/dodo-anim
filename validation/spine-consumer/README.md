# 官方 Spine JSON / binary 消费比较

用 `@esotericsoftware/spine-core` 读取同一工程的实际 JSON、binary 和 atlas，通过 `rig-c/render` 的 `spinePoser` / `AnimationState` 按 240 Hz 采样所选动作。依赖独立安装，不进入工作台主包。

本目录固定 `rig-c@2.65.1`、`@esotericsoftware/spine-core@4.3.13`、`bun@1.4.3`。从本目录执行：

```sh
npm ci --registry=https://registry.npmjs.org
npm run compare -- /absolute/path/to/input skeleton-name animation-name comparison.json
```

输入目录应有 `skeleton-name.4.3.json`、`skeleton-name.skel`、`skeleton-name.atlas`。输入只读；报告写到最后一个参数指定的位置。Bun 的 npm 包按平台选取可执行文件，lock 中的 `@oven/bun-*` 是其跨平台可选依赖，没有将本机架构包列为直接依赖。

比较骨骼名、动作名、实际绘制顺序、顶点位置和颜色，记录骨骼矩阵误差。顶点误差大于 `0.1` 或颜色误差大于 `1/255` 时结果失败，绘制顺序或数据结构不符也会触发断言。stepped 时间边界差异保留在实际采样中，不跳过帧或放宽阈值。该比较检查两种导出的消费一致性；视觉效果、接触正确性和 C++/Skia 仍需分别验证。

## 选择随包案例

例如从本目录读取随包巫师的 `cast` 导出：

```sh
npm run compare -- ../../examples/bean-wizard/exports bean-wizard cast ../../projects/wizard-check/format-comparison.json
```

这是可重跑命令，不代表该输入已经通过本目录的严格比较。每次以实际生成报告为准。原生喷火案例已记录离散附件关键帧的 JSON 小数/float32 边界差异，详见 [案例说明](../../examples/deathwing-native-fire/README.md#验证与实际画面)；不能修改原时间线来掩盖差异。

复制或打包时带上脚本、README、package.json、package-lock.json、.gitignore 和需要保留的报告，排除 `node_modules/`；到另一台电脑重新运行 `npm ci`。历史的未认可动作研究及其报告未随此仓库提供，不用它们证明三个认可案例的格式等价。此入口不代表完成跨操作系统实测；依赖许可见 [THIRD_PARTY.md](../../THIRD_PARTY.md)。
