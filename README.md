# 动动 Dodo

给 Codex 使用的二维骨骼动画 SOP 与最小工具包。输入静态图和动作目标，交付可编辑动画、网页预览和可复建脚本。没有图片时，先沿 agent-sprite-forge 的静态主图方法使用宿主图像工具生成形象。

这版重点保存制作判断：先明确动作并实际查看可复用工程，再分析支点、接触、遮挡和材质；用粗绑定测试关键姿态及反向极限，通过后再细做动作和次级运动。固定版本 Rigby2D 承担已有的骨骼计算、格式读写与渲染。

## 以后怎样直接让 Codex 使用

在已登录且可访问该私人仓库的电脑上克隆：

```sh
git clone https://github.com/RuofanYou/dodo-anim.git
cd dodo-anim
```

**把克隆后的 `dodo-anim` 目录作为 Codex 项目打开，再直接描述想要的动画。** [AGENTS.md](AGENTS.md) 会引导 AI 读取本说明和 [SKILL.md](SKILL.md)，不要求它知道此前的对话。先按下文准备当前电脑的依赖，预览服务也需要重新启动。

在其他项目里调用时，把已克隆的工作台目录或 README 提供给能读取本地文件的 Codex，并明确让它读取工作台规则。如果当前界面支持文件/目录 `@` 引用，可以选择该入口；也可以直接给本地绝对路径。仅贴一个 GitHub 页面链接不等于本机已经有工具和素材。

克隆不会自动安装全局 Skill。以项目打开或明确读取入口即可使用；若以后将完整仓库安装为可发现的 `dodo-anim` Skill，再通过技能选择器或 `$dodo-anim` 调用。不要把根目录存在 `SKILL.md` 当成已经全局安装。机制依据：[OpenAI 的 AGENTS.md 说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md)、[Skill 发现与调用说明](https://learn.chatgpt.com/docs/build-skills)。

没有图片时，可以这样说：

```text
请读取动动 Dodo 的 README.md 和 SKILL.md，按其 SOP 制作一个二维骨骼动画：
一只戴围巾的小狐狸，固定侧面，待机、挥手、开心跳跃三个动作。
先生成静态形象供我查看，选定后继续做可编辑动画、网页预览和 MP4。
新作品放到 projects/fox-guide/，暂不接入游戏。
```

已有认可图片时，可以这样说：

```text
使用动动 Dodo，保持我提供图片的形象，制作举杖、释放火焰、收势三个动作。
通用火焰先找成熟的可编辑工程，原样播放后再适配角色。
完成网页预览、可编辑源和 MP4，放到我指定的新作品目录。
```

已有源工程时，提供原文件及配套图片、atlas 等，说明要保留或改变什么。AI 应先检查真实格式和可读性，再决定复用方式；未知版本 `.spine` 不能直接假定本包读取器支持。

## 给没有本次上下文的 AI

本说明与包内文件就是制作依据，不需要寻找旧聊天。按以下顺序开始，细节读链接中的规则：

1. **确定工作台根目录与任务目录。** 读 [SKILL.md](SKILL.md)、[工作流程](references/workflow.md)，根据任务读 [控制判断](references/rigging-decisions.md)；有成熟效果时读 [复用流程](references/native-effect-reuse.md)。用户只要讨论或静态形象时，完成对应阶段即可；要求制作时继续到可播放交付。
2. **选当前任务最接近的已认可案例。** 固定视角角色与布料连接看 [巫师](examples/bean-wizard/README.md)，硬壳开合看 [宝箱](examples/bean-chest/README.md)，角色与成熟效果组合看 [原生喷火](examples/deathwing-native-fire/README.md)。先看其实际源和预览，再在新项目副本中适配；不照抄骨数、坐标、时长和显示尺度。
3. **检查所需能力，再准备环境。** 运行下文 `doctor`，按实际缺项准备依赖。生成新形象需要宿主提供图像生成/编辑能力；包内 Forge 是静态方法参考，不含完整生成服务。网页验收需要可用浏览器，分享视频需要 FFmpeg；独立软件渲染另按样例安装锁定依赖。某项不可用时明确报告受影响部分，并继续可独立完成的工作。
4. **在新作品目录完成制作。** 用户指定目录优先；未指定时用工作台的 `projects/<作品名>/`。按动作联合设计切片、隐藏面、层序和骨架，完成实际试姿再细做动作。无图时先制作静态 master；已认可图直接沿用。`init` 仅建立配置，图层、骨架 JSON、关键帧和必要脚本仍需 AI 按 SOP 制作。复用案例须带齐配置与脚本实际读取的源文件；复制到外部项目时，同时检查案例专用脚本对工作台依赖的相对引用，不能只复制 `exports/`。
5. **构建、播放并交付。** 从工作台根目录运行 `build`、`validate`、`preview`，新电脑重新启动服务器，以终端输出地址为准；其他目录执行时使用工作台脚本的绝对路径。按 [验收](references/acceptance.md) 检查实际画面，按已验证样例导出需要的视频；提供源文件、复建命令、来源和真实验证结果。

工具路径相对工作台，`workbench.json` 中的素材和脚本路径相对作品目录。样例文档里的 `127.0.0.1` 链接只在相应本机服务启动时有效；来源记录中的旧绝对路径是取证信息，不是新电脑的安装位置。不要为了迁移而修改来源证据，应使用随包源和当前路径重建。

新电脑复制完整工作台，保留 README、AGENTS、SKILL 等入口、`scripts/`、`templates/`、`vendor/`、`references/`、案例及根目录依赖清单；`node_modules/`、`.venv/` 可按锁定依赖重新安装。第三方素材与独立 runtime 的许可随来源保留，样例许可不扩为新作品的商用授权。

`examples/` 只收录三个已认可作品，作为制作与验证参考；新作品放到用户指定目录或 `projects/<作品名>/`。`validation/` 保存整理阶段的历史检查结果，报告中的旧绝对路径、外部研究目录和旧端口只是原工作记录，不是本仓库的安装位置或必需服务。缓存、重复冷启动项目、未认可动作研究和被替换的旧火焰案例不随仓库提供。

第一次可先用已有认可案例完成一次构建和实际预览，确认环境与工具可用，再制作新作品。这个检查证明启动链路可执行，不代表陌生素材已完成视觉验收。

2026-10-22 已做 [无历史上下文的冷启动复用检查](validation/readme-cold-start-report.json)：独立 AI 只按本目录入口，在新副本实际完成初始化、构建、验证与 39 个 HTTP 资源检查，16 个重建文件与原案例哈希一致。此次未打开浏览器或制作陌生新角色，网页视觉与新动作质量仍按验收流程检查。

## 从哪里开始

- **让 Codex 制作：**按上面的无上下文入口读取 [AGENTS.md](AGENTS.md) 与 [SKILL.md](SKILL.md)，提供素材和动作目标；播放器未定时先交付网页，不需要因此卡住制作。
- **看制作方法：**[工作流程](references/workflow.md)、[运动关系判断](references/rigging-decisions.md)、[验收](references/acceptance.md)。
- **看具体作品：**[绿豆巫师样例](examples/bean-wizard/README.md)，包含原图、补画图、拆层、骨架、关键帧、可编辑工程和已认可 MP4。
- **复用已认可的道具工程：**[绿豆宝箱](examples/bean-chest/README.md)，包含可编辑工程、六面箱盖、底面后沿铰链、开盖动作与 [连续预览](examples/bean-chest/evidence/chest-opening.mp4)。
- **复用已认可的角色与原生效果组合：**[死亡之翼原生喷火](examples/deathwing-native-fire/README.md)，包含原火焰恢复数据、可编辑工程、喷口挂接、原动作编排、网页与 [分享 MP4](examples/deathwing-native-fire/exports/deathwing-native-fire.mp4)。
- **需要通用演出效果：**先按 [成熟效果复用](references/native-effect-reuse.md) 选材、原样播放，再接入角色；独特角色美术与通用效果分别决定是否新作。
- **看这次实际验证：**[整理与复建记录](validation/README.md)。
- **看来源与许可：**[THIRD_PARTY.md](THIRD_PARTY.md)，分别核对工具代码、独立 runtime 与示例素材。

## 目录

```text
AGENTS.md / README.md      项目入口、无上下文启动与使用示例
SKILL.md / agents/         制作技能与显示信息
references/                制作流程、控制判断、验收、教学来源
scripts/                   检查环境、初始化、构建、验证、网页预览
scripts/spine38-reader/    两个已核验 3.8 工程结构的有界读取器，不附带第三方素材
templates/workbench.json   项目路径与构建入口模板
vendor/                    固定版本 Rigby2D 必要源码及 Forge 静态参考
examples/bean-wizard/      独立样例，所有专用坐标与检查留在这里
examples/bean-chest/       已认可宝箱，固定视角硬壳开合的复用入口
examples/deathwing-native-fire/  已认可的巨龙与成熟原生喷火组合、完整 MP4
projects/                  新作品的默认位置，按实际需求建立
validation/                整理阶段的复建与运行记录，不是新作品输出目录
THIRD_PARTY.md             第三方源码、独立 runtime 与素材许可范围
```

项目源数据沿用标准 Spine JSON、PNG 与 Rigby 工程。`workbench.json` 只记录文件路径和可选脚本入口，不定义新的骨骼或动作格式。

## 已认可宝箱样例

2026-10-21，用户明确认可本版宝箱可以沉淀为 SOP 与复用样例。对应 [构建清单](examples/bean-chest/exports/build-manifest.json) 的 SHA-256 为 `8915f9eb205f9f7219099dc0f3a9b3b35b5c449ae21847832f70b113957ae9d1`；[连续预览](examples/bean-chest/evidence/chest-opening.mp4) 为同版 `showcase` 的 7.2 秒、30 fps 导出，关联信息见 [preview-manifest.json](examples/bean-chest/evidence/preview-manifest.json)。该认可范围不扩为 C++/Skia、目标游戏或设备性能验收。

复用时先查看预览与 [可编辑 .rigby](examples/bean-chest/exports/bean-chest.rigby)，再检查 [结构/相机参数](examples/bean-chest/source/rig_spec.json)、[动作参数](examples/bean-chest/source/actions.json)、[体积箱盖实现](examples/bean-chest/scripts/volumetric_lid.mjs) 和素材来源。当前方案用 Three.js 实际六面体绕底面后沿旋转，再把透视投影烘焙为二维骨骼与加权网格。优先在新副本中适配素材和动作；视角、支点或形状改变时，重新检查对应几何与遮挡。复建及真实消费端命令见 [样例说明](examples/bean-chest/README.md)。

## 已认可原生效果复用样例

2026-10-22，用户认可死亡之翼原生喷火及分享视频，并要求沉淀为后续 SOP。先看 [样例与复建命令](examples/deathwing-native-fire/README.md)，再查看 [制作与接口规则](references/native-effect-reuse.md)。该例将已有角色身体动作与用户提供火焰工程的原骨架、原图和原动作组合，新增喷口注册、尺度与片段衔接；原创美术、素材复用和组合编排各自记录。

确认的 [6 秒 MP4](examples/deathwing-native-fire/exports/deathwing-native-fire.mp4) SHA-256 为 `2b7f9f3f4037124003698b53ce64c7c096f47de699290f5b03f0593ca6c87943`，源数据和 360 帧完整解码见 [导出记录](examples/deathwing-native-fire/evidence/mp4-export.json)。用户视觉认可与 Rigby 网页播放各有证据；官方编辑器、C++/Skia 和目标设备仍需另测，第三方素材许可尚未确认。

## 准备环境

需要 Node.js 20 或以上、Python 3.10 或以上。美术拆分与图集构建使用 NumPy、Pillow，依赖范围见 [requirements.txt](requirements.txt)。宝箱的体积箱盖构建使用 `three@0.186.1`；从工作台根目录运行 `npm ci`，按 `package-lock.json` 安装 npm 依赖。固定版本 Rigby2D 源码随 `vendor/` 提供。

macOS/Linux：

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
node scripts/workbench.mjs doctor --python .venv/bin/python
node scripts/workbench.mjs build examples/bean-wizard --python .venv/bin/python --exchange
node scripts/workbench.mjs preview examples/bean-wizard --port 3050
```

Windows PowerShell：

```powershell
npm ci
py -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
node scripts/workbench.mjs doctor --python .venv\Scripts\python.exe
node scripts/workbench.mjs build examples/bean-wizard --python .venv\Scripts\python.exe --exchange
node scripts/workbench.mjs preview examples/bean-wizard --port 3050
```

这些命令从工作台根目录执行；有空格的路径加引号。服务器只监听本机，预览地址以终端输出为准。也可以通过 `ANIMATION_PYTHON` 指定已安装依赖的 Python。

网页有动作选择、播放暂停、时间定位和骨骼查看。它读取实际交付资源并使用内置固定版本 Rigby2D WebGL 渲染器。巫师的视频出口和 FFmpeg 整理步骤见样例说明。

## 接入新项目

```sh
node scripts/workbench.mjs init /你的项目目录
```

初始化建立项目配置。Codex 先按 Skill 写动画计划、分析结构、准备素材并测试关键姿态，再配置该项目的标准 JSON、PNG 和可选构建入口：

```json
{
  "name": "my-animation",
  "sourceImage": "art/master.png",
  "skeleton": "source/skeleton.json",
  "parts": "parts",
  "output": "exports"
}
```

路径相对项目目录。需要从其他可编辑参数编译 JSON 时，再添加 `buildScript`；有接触、事件或连接带等具体契约时，再添加 `validationScript`。项目脚本在项目目录执行，可读取 `ANIMATION_PROJECT_DIR`、`ANIMATION_WORKBENCH_DIR`、`ANIMATION_PYTHON`。

```sh
node scripts/workbench.mjs build /你的项目目录
node scripts/workbench.mjs validate /你的项目目录
node scripts/workbench.mjs preview /你的项目目录
```

默认输出标准 JSON、独立 PNG、atlas+PNG、可编辑 `.rigby` 与验证记录。`build --exchange` 另外生成 4.3 JSON 和 `.skel`；已输出交换格式的项目，后续构建会同步更新它们。`build-manifest.json` 记录声明输入与实际交付文件的 SHA-256，输入或输出过期时 `validate` 明确失败。通用构建默认做当前 Rigby 版本的往返检查；[独立 Spine 消费入口](validation/spine-consumer/README.md) 可另测实际 JSON 与二进制。是否完成消费检查以每个作品的实际报告为准。

## 当前能力与下一次验证

这份目录保存方法、工具和已成功的样例。巫师的源图、坐标、26 根骨骼、15 张贴图及权重规则属于该作品。后续对新素材必须重新判断结构与控制关系，再通过试姿检验。

宝箱补充了固定视角硬壳开合、真实厚度、后沿铰链和二维消费端的实际案例；其源工程可作为后续同类对象的二开起点。跨操作系统、目标游戏播放和设备性能仍需分别验证。

死亡之翼原生喷火已验证固定视角角色与成熟效果的组合：先看原效果、保留原动作，再检查接口与混合。它补充了巫师原创绑定和宝箱结构二开之外的另一条生产路径。需要连续大幅转身、展示背面和复杂空间支撑的动作，应先评估三维制作；是否最终输出二维资源另行决定。

原图美术、隐藏面修补、骨架设计与动作复用分别记录。预览视频从可编辑工程确定性渲染，不采用生成视频或视频切帧。第三方源码与静态参考的版本、文件哈希和许可证随包保留，范围见 [THIRD_PARTY.md](THIRD_PARTY.md)。

本仓库是独立素材工作台；新任务的范围和授权由当前用户请求决定。复制这些制作规则不自动授权修改游戏、联系他人或发布作品。
