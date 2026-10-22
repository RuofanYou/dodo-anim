# LoongBones / DragonBones 对 Dodo 的价值评估

核查日期：2026-10-22。问题是能否提高 Dodo 的稳定产出与复用能力。本文分别评估当前 LoongBones 产品、DragonBones 开源 SDK / 示例、旧 Tools 转换器，避免把不同实现的能力或限制混为一谈。

结论：**有实际帮助，值得进入候选工具与成熟工程来源；当前证据支持补充 Dodo，还不足以直接替换已验收的制作和播放链路。** 最值得吸收的是拆图与隐藏面补全候选、保留装配关系的素材更新、现成绑定与动作复用、非人物演出的可编辑例子，以及开放运行时的实现。真正缺少的仍是对“指定原图 + 指定动作”的结构设计、接触与遮挡验证，以及转换后的实际画面对照。

## 1. 本次检查了什么

检查了公开产品文档、仓库原始工程 / 标准导出、运行时源码、许可文件，并执行了两个局部探针。没有安装或登录编辑器，没有消耗 AI 额度，没有做 LoongBones 实际生图 / 拆图 / 动画生成，没有做该产品导出插件的往返测试，也没有把新链路加入生产 SOP。

| 对象 | 本次固定版本 | 证据范围 |
| --- | --- | --- |
| LoongBones 文档 | `f866e596cc7b7a7fa52e6d5f349d2dc7be237434` | 公开功能说明与截图，未实际执行产品 AI |
| DragonBonesJS | `64b6c69ae35777c2404be68c9192e2c56906079e` | 原始示例数据、TS 源码、随包 5.7.000 核心的 CPU 探针 |
| DragonBonesCPP | `f696143045e07b7c4c4590bdd95534e9e8074b37` | C++ 核心、SFML / Cocos / Android 适配结构，未编译运行 |
| DragonBones Demos | `83d757f8a0ae67341798f3ec2c5cede0b83f3784` | 56 个 `.dbproj`、图集等文件存在；未在编辑器打开 |
| DragonBones Tools | `4bdafe9a36362eb3b623d999e18fcab5364c871c` | CLI 入口、格式转换源码与隔离核心函数探针 |

项目年代、stars 和界面风格不作为能力判断依据。SDK 仓库当前还包含 Pixi 8 适配和 Android Compose 集成；具体可用性仍按输入、调用和运行结果判断。[JS 适配目录](https://github.com/DragonBones/DragonBonesJS/tree/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/8.x)、[Android Compose](https://github.com/DragonBones/DragonBonesCPP/tree/f696143045e07b7c4c4590bdd95534e9e8074b37/AndroidCompose)。

## 2. 当前 LoongBones：最接近我们痛点的内容

### AI 拆图与补面值得试用，但不能替代动作分析

龙鳞文档说明，拆图采用 See-Through，将图像拆成补全后的独立语义层并推断层序，返回分层 PSD，最多 23 层；同时明确更适合卡通人像，其他类别不建议使用。它直接对应 Dodo 的“从静态图准备可活动组件和隐藏面”环节，价值很具体。这里的 23 是该能力的层数描述，不能转成 Dodo 的推荐切片数量，也不能推广到宝箱、火焰、地图等任意对象。[AI 拆图文档](https://github.com/DragonBones/Loongbones-doc/blob/f866e596cc7b7a7fa52e6d5f349d2dc7be237434/zh/loongscales/ai.md)、[See-Through 原项目](https://github.com/shitagaki-lab/see-through)。

推论：可让它给出候选分层、隐藏面和初始层序，再根据任务动作做合并、补切、支点与粗绑定试姿。静态语义层是否恰好适合摆臂、开盖或大幅摆头，需要同一角色的实际姿态验证。公开文档没有提供面向这些动作的自动绑定准确率或失败率，本次也没有实测。

### 稳定引用的素材同步比“拆得更多”更重要

龙鳞与龙骨通过 `loongbonesId` 关联位图素材。文档描述首次同步会创建并摆放 slot，后续同步更新已有素材；新图进入草稿箱，避免自动改变现有装配；一侧删图也不直接反向删除动画引用。[同步文档](https://github.com/DragonBones/Loongbones-doc/blob/f866e596cc7b7a7fa52e6d5f349d2dc7be237434/zh/loongscales/loongbones-sync.md)。

这对应用户担心的“切得多，组装更容易错”。可吸收的设计思想是：组件有稳定身份，修改图片时保留坐标和引用，新组件明确进入装配步骤。Dodo 已有输入哈希和独立案例；若以后增加反复改图流程，应优先验证稳定组件映射，而不是增加任意数量的切片或全面照搬云同步系统。此处是流程建议，尚未新增机制。

### 自然语言动画存在产品入口，完整自动绑骨尚待验证

编辑器文档展示自然语言描述动画的 AI 助手。这值得用 Dodo 的同一份输入对比尝试，不能仅凭一页说明认定已经解决自动识别合理关节、支撑、重心、所有非人物运动关系的问题。本次未找到可据以验证批量自动生产的公开 API / CLI 或自动绑定准确率资料；这表示证据不足，不表示产品没有相关内部能力。[AI 助手文档](https://github.com/DragonBones/Loongbones-doc/blob/f866e596cc7b7a7fa52e6d5f349d2dc7be237434/zh/loongbones/editor/ui-ai.md)。

### 当前产品的格式能力独立核实

导入文档明确列出龙骨 JSON、`.dbproj`、PSD，以及 Spine 3.8.75 的 JSON + atlas + PNG。导出文档说明使用插件选择目标类型和版本，Spine 目标只支持一个骨架；未列出完整版本与特性兼容表。这里没有证明可直接导入 `.spine` 编辑器二进制源文件。旧开源 Tools 的限制也不能外推为当前插件的限制。[导入](https://github.com/DragonBones/Loongbones-doc/blob/f866e596cc7b7a7fa52e6d5f349d2dc7be237434/zh/loongbones/editor/ui-import.md)、[插件导出](https://github.com/DragonBones/Loongbones-doc/blob/f866e596cc7b7a7fa52e6d5f349d2dc7be237434/zh/loongbones/editor/export-other-data.md)。

## 3. 开源示例：确实有可学习和复用的工程结构

本次读取了实际 `_ske.json`，检查骨骼、slot、显示附件、动画和贴图，而非仅引用 README 功能列表。下列均有对应纹理描述和 PNG。表中骨骼 / slot 数属于特定 armature，不是整个目录的合计。

| 类别与实际文件 | 文件中检查到的内容 | 对 Dodo 的用途 |
| --- | --- | --- |
| [progress_bar](https://github.com/DragonBones/DragonBonesJS/tree/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/resource/progress_bar) | `progress_bar`：5 骨、4 slot、100 帧 idle；`loading`：7 骨、6 slot；前者有 start / middle / complete 三个事件标记 | UI 演出、可拖动进度、阶段事件，不依赖人体骨架 |
| [floor_board](https://github.com/DragonBones/DragonBonesJS/tree/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/resource/floor_board) | 平台 4 骨、5 slot、50 帧 idle；内含 `flame_01` 子 armature，含 add 混合 slot | 可动平台、嵌套组合、接触控制；火焰是小型样例，不能据此认定适合巨龙喷流 |
| [effect](https://github.com/DragonBones/DragonBonesJS/tree/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/resource/effect) | `flower`：36 骨、32 slot、28 个 mesh display、110 帧 skill、8 条 FFD 轨；多个 add 混合 slot；另有 sprite armature | 非人物效果如何联合使用骨骼、网格变形、显示切换和混合。没有查看实际画面前，不按文件名认定其美术或运动匹配 |
| [bullet_01](https://github.com/DragonBones/DragonBonesJS/tree/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/resource/bullet_01) | 2 骨、1 slot、12 帧 idle | 小型投射物的可编辑运动入口 |
| [mecha_1406](https://github.com/DragonBones/DragonBonesJS/tree/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/resource/mecha_1406) | 17 骨、13 slot、4 个 IK，idle / walk / attack / death / hit / jump / skill / aim 共 8 动作 | 腿部接触、瞄准与上下层动作分工的具体参考 |
| [mecha_2903](https://github.com/DragonBones/DragonBonesJS/tree/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/resource/mecha_2903) | 4 个各 35 骨的 armature；源 `mecha_2903d` 有 11 段动作，其余可替换动作 | 同结构不同外观复用动作；不能推广为任意骨架之间的自动重定向 |

Demos 仓库另有 56 份 `.dbproj`，包括 progress_bar、floor_board、bullet_01、mecha 与分部换装工程。抽查 `.dbproj` 是二进制，不能当成标准 JSON 读取；本次执行的是 SDK 中的标准导出，未宣称编辑器项目已成功打开。[原始工程目录](https://github.com/DragonBones/Demos/tree/83d757f8a0ae67341798f3ec2c5cede0b83f3784/DragonBones%20Pro/Demos)。

### API 与机制有对应的实际调用

- **换皮 / 部件替换**：`ReplaceSkin.ts` 读取身体与两套分部素材，再调用 `replaceSkin`；`ReplaceSlotDisplay.ts` 演示单个 slot 替换。这可以直接学习“骨架保持，替换所需显示”的组织方式。[换皮示例](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/8.x/src/ReplaceSkin.ts)、[slot 示例](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/8.x/src/ReplaceSlotDisplay.ts)。
- **动作复用**：`ReplaceAnimation.ts` 把 `mecha_2903d` 的动作赋给另外三套同结构角色。它是现成、可检查的资源复用流程，不是 AI 猜新动作。[动作替换](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/8.x/src/ReplaceAnimation.ts)。
- **IK / 接触**：`InverseKinematics.ts` 将角色放进平台 slot，根据平台角度更新左右脚控制，同时用 aim 动画进度控制朝向。可借鉴明确“谁在世界空间固定、谁跟随”的设计。[IK 示例](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/8.x/src/InverseKinematics.ts)。
- **阶段触发 / 发射接口**：`CoreElement.ts` 监听武器的 `FRAME_EVENT`，在事件名 `fire` 时取坐标产生投射物；`DragonBonesEvent.ts` 在技能 COMPLETE 后回到 walk。可以学习把事件、子骨架和接口分开组织。[发射示例](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/8.x/src/CoreElement.ts)、[技能阶段示例](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/Pixi/Demos/8.x/src/DragonBonesEvent.ts)。
- **FFD / 层序**：effect 的真实数据中有 FFD；核心存在 ZOrder parser 与 timeline。扫描 SDK 的 `_ske.json` 时没有找到动态 `zOrder` 样例，因此动态层序属于本次源码确认项，不能写成样例播放已验收。[timeline 实现](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/animation/TimelineState.ts#L269-L285)、[解析实现](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/DragonBones/src/dragonBones/parser/ObjectDataParser.ts#L1579-L1630)。

### 本次 SDK 局部执行结果

用随仓库提供的 DragonBones 5.7.000 核心，配一个不绘图的适配器，实际解析上述 6 个标准导出并按 60 Hz 求值：12 个 armature、30 段动作、2,346 个采样，骨骼矩阵均为有限数。实际调用 `replaceAnimation` 后，目标从只有 idle 变为源 11 动作；调用 `replaceSkin` 后替换了 9 个 slot 的显示，17 根骨骼数量保持。

这证明这些输入能被该核心解析、求值和调用复用 API，**没有渲染像素，不能代替自然度、接缝、混合或跨格式保真验收**。探针收到生命周期事件，但未收到自定义 `frameEvent`；源码和原始数据中的事件机制已确认，端到端消费仍未通过本次探针验证。

研究工作目录中的可复现证据：`examples-probe/probe.cjs`、`examples-probe/result.json`。命令为 `node examples-probe/probe.cjs`，依赖相邻研究克隆，未进入 Dodo 生产依赖。

## 4. 许可需要按“代码”与“美术动作”分别处理

JS / CPP SDK 和 Tools 的 LICENSE 是 MIT，可作为工具和适配代码来源，并保留相应声明。Demos 美术仓库明确采用 **CC BY-NC-SA 4.0**，不是可直接随商业游戏使用的通用素材包。SDK 资源目录也应逐个追溯原素材来源，不能用代码仓库根目录的 MIT 一概认定所有角色形象、动作、美术都无商业限制。[JS 许可](https://github.com/DragonBones/DragonBonesJS/blob/64b6c69ae35777c2404be68c9192e2c56906079e/LICENSE)、[CPP 许可](https://github.com/DragonBones/DragonBonesCPP/blob/f696143045e07b7c4c4590bdd95534e9e8074b37/LICENSE)、[Demos 许可说明](https://github.com/DragonBones/Demos/blob/83d757f8a0ae67341798f3ec2c5cede0b83f3784/README.md)。

这不影响学习其结构、制作研究用对照和评估工具；涉及商业交付或向仓库复制素材时，另核对该项资源的具体许可。

## 5. 旧 Tools：有可用实现，也有实测转换损失

旧 Tools 提供真实 Node CLI 和双向 Spine JSON / DragonBones JSON 转换。`2db -t spine` 扫描 `.json` 并 `JSON.parse`，不是 `.spine` 编辑器工程或 `.skel` 二进制 reader；`db2 -t spine` 的目标版本写死为 Spine `3.6.0`。旋转图集可能调用浏览器 helper，不能把所有输入都描述为纯无界面转换。[输入入口](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/convertFrom.ts#L35-L56)、[输出版本](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/convertTo.ts#L281-L286)、[图集 helper](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/convertFrom.ts#L111-L132)。

隔离调用核心转换函数的结果如下。这些结论只属于该固定 commit，不代表当前 LoongBones 插件的结果。

| 分项 | 本次实际结果 |
| --- | --- |
| 3.6 权重网格、FFD、Bezier 数组、drawOrder | 分别有可核对的输出；3 顶点权重编码往返相同、2 帧 FFD 保留、4 个曲线值保留、slot offset 转为 zOrder |
| setup IK | 一个约束保留 |
| 动画 IK | 2 个 key 转出 0 条 timeline；源码创建后未挂入 animation |
| transform constraint | 1 个约束往返后为 0 |
| multiply / additive | 分别成为 normal / add |
| 事件值 | 产生事件，但显式 `0 / 0 / 空串` 被默认值覆盖 |
| Spine 3.8 数字曲线 | 不适配该 schema，不能按保真曲线消费 |
| Dodo 真实 native-fire 3.8.99 输入 | 43 骨、38 slot 有输出；skins 数组被按旧 map 处理，生成名为 `0` 的 skin、45 个 display，源为 39 个附件，不能直接替代已认可链路 |

具体源码：[网格](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/action/fromSpine.ts#L194-L267)、[FFD](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/action/fromSpine.ts#L588-L674)、[IK](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/action/fromSpine.ts#L679-L696)、[事件](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/action/fromSpine.ts#L698-L738)、[层序](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/action/fromSpine.ts#L740-L757)、[曲线](https://github.com/DragonBones/Tools/blob/4bdafe9a36362eb3b623d999e18fcab5364c871c/src/action/fromSpine.ts#L790-L803)。研究目录保留 `tools-audit.md`、`tools-probe/probe.cjs` 和 `tools-probe/result.json`。

## 6. C++ / Skia：可参考开放核心，仍需专用渲染适配

CPP 将骨架 / 动画 / parser / factory 核心与具体引擎适配分开。`Slot.h` 要求适配器实现可见性、混合、颜色、层序、贴图帧、网格、变换等回调；SFML 的 `_updateFrame` 和 `_updateMesh` 展示如何得到 UV、三角形和加权 / FFD 后的顶点。可以据此估算 C++ 消费成本，不必自造骨骼求值器。[核心接口](https://github.com/DragonBones/DragonBonesCPP/blob/f696143045e07b7c4c4590bdd95534e9e8074b37/DragonBones/src/dragonBones/armature/Slot.h#L153-L166)、[SFML 实现](https://github.com/DragonBones/DragonBonesCPP/blob/f696143045e07b7c4c4590bdd95534e9e8074b37/SFML/src/dragonBones/SFMLSlot.cpp)、[Cocos 适配](https://github.com/DragonBones/DragonBonesCPP/tree/f696143045e07b7c4c4590bdd95534e9e8074b37/Cocos2DX_3.x)。

本次在 CPP 仓库没有找到 Skia 适配。推论是未来可以保留 DragonBones 核心，给 Skia 实现 slot / mesh / atlas / blend / order 适配；这仍是一项集成工作，不能因“有 C++”认定 C++ / Skia 已接通。也可在确有需求且转换保真已验证时进入现有 Spine 目标链路。当前 Dodo 的 C++ / Skia 本就列为未验收项，本次没有改变这个状态。[Dodo 验收边界](acceptance.md)。

## 7. 对照 Dodo：应补哪里，暂不做哪里

已读 [SKILL.md](../SKILL.md)、[成熟效果复用](native-effect-reuse.md) 与现有案例。现有 SOP 已有“先看成熟原工程、按动作联合决定切片与控制、粗绑定试姿、真实播放器验收”的原则；缺的是更多可操作候选与按特性验证的适配路线，不能再写一遍原则就算吸收完成。

| Dodo 的现状 / 缺口 | 这次能补的内容 | 采用判断 |
| --- | --- | --- |
| 成熟来源目前偏 Spine 案例 | 将 DragonBones 原工程、标准导出和示例代码加入同类资源检索 | 可以立即作为选材候选，先原格式播放再适配 |
| 拆图与补面依赖个案处理 | 龙鳞 / See-Through 的语义分层与补遮挡候选 | 值得用同一角色试验；动作需求决定最终颗粒度 |
| 反复修图可能破坏装配 | 学习稳定组件 ID、坐标与 slot 引用保持的更新方式 | 有实际反复改图需求再实现最小机制 |
| 绑定 / 动作复用主要靠案例脚本 | ReplaceSkin、ReplaceAnimation、IK、嵌套与事件示例 | 学习已有结构和 API，不能承诺任意骨架自动迁移动作 |
| 非人物演出需要更多成熟参考 | progress_bar、floor_board、effect、bullet | 先检查原效果的画风与运动是否匹配，再决定复用哪些部分 |
| 交换格式只证明特定链路 | 当前 LoongBones 插件与旧 Tools 分别做输入版本 / 特性对照 | 不把“能导出 JSON”当作保真；保留源格式和原动画 |
| 自动识别合理运动关系仍无充分验证 | AI 拆图、自然语言动画入口可参与比较 | 仍需关键姿态、接触、遮挡及极限试姿验收 |

建议下一次只做一个小而完整的对照：同一份已认可角色，限定待机 + 挥手等固定视角动作，比较 Dodo 当前流程与 LoongBones 候选流程的拆图修改量、引用保持、试姿返工和导出画面。若试非人物，应另选已有匹配工程，不能用卡通人像拆图能力推断火焰或箱盖能力。若要判断转换器，使用含 mesh / FFD / IK / 层序 / 混合 / 事件的对应样例，做同时间采样与逐帧画面对照。

本次只保存研究判断与可复查证据，没有切换默认运行时，没有把尚未测试的 AI 能力写成 Dodo 已具备的能力，没有修改游戏，也没有提交或推送远端。
