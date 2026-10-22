# 绿豆主题魔法宝箱

动动 Dodo 的可编辑固定视角开箱演出，包含闭合、开盖、宝石升起、停留与合盖。制作源是静态图片、动作参数、骨架和加权网格；`.rigby` 保留为工作台的可编辑工程。新作品在独立任务目录适配，不覆盖本认可样例；工具和素材范围见 [THIRD_PARTY.md](../../THIRD_PARTY.md)。

## 素材与实现来源

静态主图、打开后的内壁、外盖材料和宝石由宿主 `image_gen` 生成，来源及图片哈希记录在 [provenance.json](source/provenance.json)，生成意图记录在 `source/component-prompts.json`。`scripts/split_art.py` 从现有图片提取箱体、内壁、盖面与锁扣，生成匹配的厚度材料和少量程序化光效。最终闭合画面经过材质注册与结构调整，不声明与概念合成图逐像素相同。

箱盖几何复用 `three@0.186.1` 的 `BoxGeometry`，铰链取底面后沿 `bottomRearLeft → bottomRearRight`，沿箱口平面的 X 轴用 `Group.rotateX` 转动。局部坐标中底面为 `y=0`、顶面为 `y=50`、后沿为 `z=0`，开盖沿负 X 方向旋转；通过 `PerspectiveCamera` 和 `Vector3.project` 投影。尺寸、50 单位厚度及相机参数来自 [rig_spec.json](source/rig_spec.json)。六个实际表面共享三维顶点控制，投影结果被烘焙为标准二维骨骼位移、加权网格和附件可见性；当前导出有 100 根骨骼、19 个槽位。目标二维播放器读取烘焙结果，构建时使用的 Three 几何保存在 `scripts/volumetric_lid.mjs`。

动作曲线和宝石/光效事件由本项目编写，参数在 [actions.json](source/actions.json)。`scripts/build_rig.mjs` 按箱盖表面的朝向和深度生成可见性与 drawOrder 时间线。外盖可见时，箱盖晚于前壁绘制；内盖可见时，绘制顺序为后箱体、箱盖表面、铰链金边、光效/宝石、前壁、锁扣，其中箱盖各面按深度排序。锁扣像素由独立 `clasp` 槽持有。工程读写、骨骼计算与工作台预览复用固定版本 Rigby2D，提交为 `6069ae2ef8cfbb622053a84e7ccd4acc74c06415`。

## 复建

从工作台根目录执行，Python 环境需包含根目录 `requirements.txt` 中的依赖：

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
node scripts/workbench.mjs build examples/bean-chest --python .venv/bin/python --exchange
node scripts/workbench.mjs validate examples/bean-chest --python .venv/bin/python
node scripts/workbench.mjs preview examples/bean-chest --port 3051
```

也可用 `--python` 指向已有依赖环境。配置的 `inputs` 显式列出实际源图、参数和构建子脚本；`exports/build-manifest.json` 记录输入与导出的哈希，`exports/validation.json` 及 [几何检查记录](evidence/rig-verification.json) 对应本轮构建。

## 独立消费端检查

可选独立检查使用 [spine-consumer](../../validation/spine-consumer/README.md) 中锁定的 `rig-c@2.65.1`、`@esotericsoftware/spine-core@4.3.13` 和 Bun 1.4.3。先进入 `validation/spine-consumer/` 执行 `npm ci`，再回到仓库根目录执行：

```sh
validation/spine-consumer/node_modules/.bin/bun validation/spine-consumer/node_modules/rig-c/cli.ts render --candidate examples/bean-chest/exports/bean-chest.4.3.json --atlas examples/bean-chest/exports/bean-chest.atlas --animation showcase --fps 8 --max 768 --poser spine --out projects/chest-review
validation/spine-consumer/node_modules/.bin/bun validation/spine-consumer/node_modules/rig-c/cli.ts inspect --candidate examples/bean-chest/exports/bean-chest.4.3.json --atlas examples/bean-chest/exports/bean-chest.atlas --animation showcase --at 0,1.44,1.48,1.5,1.55,1.625,1.82,2.8 --fps 200 --show art,mesh,slots --dim --max 768 --poser spine --out projects/chest-review/inspect.png
```

这里通过官方 Spine Core 计算姿态，再由 rig-c 离线栅格化，使用范围按其独立许可判断。历史的外部消费端研究目录不随仓库提供；随包保留 [闭合](evidence/final-closed.png)、[盖面转折](evidence/final-edge-transition.png)、[打开](evidence/final-open.png) 和 [网页实播](evidence/final-web-preview.png) 画面。重新运行时把新的检查输出保存在新任务目录。精确姿态检查使用 200 fps 时间网格，使列出的时间均可采样；这与原速播放、设备性能和目标游戏集成的验收范围分别记录。

## 连续预览导出

[chest-opening.mp4](evidence/chest-opening.mp4) 为同一构建的 7.2 秒、30 fps 确定性播放导出；版本、画布与校验见 [preview-manifest.json](evidence/preview-manifest.json)。安装上述消费端后从仓库根目录执行，FFmpeg 需在 PATH 中：

```sh
validation/spine-consumer/node_modules/.bin/bun validation/spine-consumer/node_modules/rig-c/cli.ts render --candidate examples/bean-chest/exports/bean-chest.4.3.json --atlas examples/bean-chest/exports/bean-chest.atlas --animation showcase --fps 30 --max 768 --poser spine --out projects/chest-preview30
ffmpeg -n -framerate 30 -i 'projects/chest-preview30/showcase@30fps/f%04d.png' -frames:v 216 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart projects/chest-preview30/chest-opening.mp4
```

消费端额外采样了循环终点，编码取前 216 帧，时长为 7.2 秒。输出文件已存在时，`-n` 会停止；需要重导时使用新的输出名，或先将本任务生成且不再需要的预览移到系统废纸篓。
