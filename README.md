# 玉米 CORN

玉米是一款简易的通用资源管理系统。

## 设计

玉米资源管理系统采用预算计划和预算分配的方式控制活动的资源消耗。

## 概念

**资源**

资源是活动中成本的统称，包含时间成本、人力成本、资金成本等。在玉米资源管理系统中，可以将所有需要控制用量的成本统称为资源。

**活动**

活动是为达到某一目的做出的所有行为的统称，使用玉米资源管理系统是为了帮助用户在活动中控制资源的消耗，活动都是需要消耗资源才能持续进行的，资源预算将在随着活动的进行消耗殆尽。

**配额**

通过创建预算的方式创建资源配额，并将配额划分给活动，活动只能在配额范围内消耗资源，当活动的资源配额消耗殆尽后，则活动无法进行，或者在调整配额后继续进行。

**消耗**

所有的活动进行都是需要消耗资源的，可以手动记录资源消耗，或者为活动添加资源消耗记录器自动记录资源消耗。

## 设计

### 资源

**类别** 

需要规划的资源并不是只有一种，一项活动的进行通常需要消耗多种资源才能进行，为了方便管理不同种类的资源，所有的资源都会被划分到各种分类中。

**标签**

除了使用类别管理资源外，也可以使用标签进行更灵活准确的资源管理，标签使用key-value的形式添加，在随后的资源管理中，用户可以使用标签对资源进行过滤。

### 活动

**空间**

为了方便对活动进行管理，需要将活动设置到特性的活动空间中，例如学习和工作，活动空间往往是独立并互斥的，使用各自独立的预算创建资源。而后再为空间中的活动创建资源配额。

**标签**

和资源标签类似，活动标签也是为了方便对活动进行管理，可以通过标签对活动进行检索或者匹配资源。

**层级**

我们在计划活动的时候通常会对活动进行不同粒度的分割，活动之间存在父子管理，如果一个活动存在父级活动，那么这个活动的资源配额只能来自父级活动的资源配额，也就是说所有子级活动的资源配额之和小于等于父级资源的配额。

为了方便对层级进行标识，我们使用命名空间标识活动的层级，活动命名空间的顶级是空间，末级是活动的直接父级。

### 资源消耗

**记录**

资源消耗记录用于记录资源的消耗，所有记录消耗的资源之和等于活动的资源消耗总额，使用资源消耗记录不仅是为了计算配额的余额，也是为了记录资源消耗的整个过程，方便对资源消耗进行分析。

**记录器**

除了手动创建资源消耗，也可以通过添加消耗记录器自动记录资源的消耗，比如时间消耗记录器可以每天创建一条时间资源消耗记录，用于管理时间的消耗。
