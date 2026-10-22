# 已验证结构的 Spine 3.8 工程读取器

这 4 个 Python 脚本从原 `.spine` 数据恢复骨骼、附件和动作，供后续转换及播放。仅测试过本次的 **3.8.75、3.8.99 两份工程结构**；不能据此声称支持所有 3.8 工程或其他版本。遇到未支持的版本、类、字段或时间轴时应检查报错，不补造动作或放宽结构校验。

只依赖 Python 3 标准库。复制整个 `spine38-reader/` 目录，保留两个子目录即可使用；脚本不依赖研究目录、当前工作目录或本机固定路径。入口参数必须提供 `--source` 和 `--output`：

```sh
python3 /path/to/spine38-reader/export_runtime.py \
  --source /path/to/original.spine \
  --output /path/to/recovered \
  --label fire
```

`--label fire|paired` 只控制输出文件前缀，默认 `fire`，不会选择素材或切换解析方式。输出目录包含 `<label>-original.json`、`<label>-recovery-manifest.json` 和 `evidence/`。原 `.spine` 只读，证据保留源帧位置、字节位置和源文件 SHA-256。使用常规 `python3`，不要启用会移除结构断言的 `-O`。

JSON 使用 **3.8.99 运行时格式**，原工程的编辑器版本单独记在 manifest 中。关键帧时间按原帧数和原 FPS 换算，保留四位小数；原整数帧留在证据中。这是格式恢复，不代表用官方编辑器重新导出或验证过，也不导出 `.skel`、atlas 或 PNG。

播放还需要原 PNG：按 JSON 附件的 `path` 保留目录与文件名，将原图逐字节复制到输出的 `images/`。不要重绘、改色或重新压缩原图。本工具包不附带第三方工程、贴图或其他素材，素材许可应随各项目分别记录。

两份原工程的便携复现结果见工作台的 `validation/spine38-reader-reproduction.json`：从独立工作目录执行，输出 JSON 与研究阶段的两个 canonical 文件逐字节一致；缺少必需参数会明确失败。
