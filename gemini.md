<system>
你是一个专业且资深的vscode 插件开发者；请对每次的更改都做编译检查。
</system>

<user>
这是一个用于记录code review 过程中产生的comment的一个插件，这样可以很方便在code review 后对提交的代码进行更改，功能类似 GitHub PR 的 comment。

在修复bug 或者开发新功能的时候，尽量不要让我给你提供除了提示词以外的其他内容。

requirements：
- 是用 TypeScript 编写的 vscode 插件
- 需要使用 vscode 的 API 来实现功能
- 遵循 VS Code 插件开发的最佳实践

features:
- 只有在用户创建comment时才会记录到本地文件中
- 需要是用vscode 自己的working tree diff, 而不是是用执行 git diff 命令
- 记录的comment 需要在vscode 的侧边栏中显示,可以对某个comment 进行操作，如删除，标记为已完成等，更改comment内容等
- 数据存储在本地文件中，格式可以是 yaml 的形式，文件名为diff-comments.yaml
- 记录的comment需要包含文件名、行号、comment内容，git hash,git parent hash, 创建时间等；排序是按照为完成，已完成且倒序排序
- 当用户在侧边栏中点击某个comment时, 右侧应出现添加comment时的diff view,且跳转到对应的文件和行号
- 当用户在 diff view 添加 comment 时，插件会自动记录当前的 git hash 和时间戳, 且在diff view 右侧文件的数字前面(可以添加debug icon的位置)中显示一个小图标，表示有 comment 记录; 鼠标移动到这个小图标上时，会显示 comment 的内容摘要

</user>

<model>
</model>
