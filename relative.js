        // 全局变量存储数据
        let analysisData = null;
        let correlationMatrix = null;
        let trendsChart = null;
        let currentThreshold = 0.7; // 默认阈值
        
        // 初始化图表
        function initChart() {
            const ctx = document.getElementById('trends-chart').getContext('2d');
            trendsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    },
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: '每日平均销量排名（数值越小越好）'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: '日期'
                            }
                        }
                    }
                }
            });
        }
        
        // 初始化滑块事件
        function initSlider() {
            const slider = document.getElementById('correlation-threshold');
            const thresholdValue = document.getElementById('threshold-value');
            const positiveThresholdDisplay = document.getElementById('positive-threshold-display');
            const negativeThresholdDisplay = document.getElementById('negative-threshold-display');
            const heatmapThresholdDisplay = document.getElementById('heatmap-threshold-display');
            
            slider.addEventListener('input', function() {
                currentThreshold = parseFloat(this.value);
                thresholdValue.textContent = currentThreshold.toFixed(2);
                positiveThresholdDisplay.textContent = currentThreshold.toFixed(2);
                negativeThresholdDisplay.textContent = (-currentThreshold).toFixed(2);
                heatmapThresholdDisplay.textContent = currentThreshold.toFixed(2);
                
                // 重新渲染相关内容
                if (analysisData && correlationMatrix) {
                    renderCorrelationPairs(correlationMatrix, analysisData.asins);
                    renderHeatmap(correlationMatrix, analysisData.asins);
                    updateStatistics(correlationMatrix);
                }
            });
        }
        
        // 显示状态消息
        function showMessage(elementId, text) {
            // 隐藏所有消息
            document.querySelectorAll('.status-message').forEach(el => {
                el.classList.add('hidden');
            });
            
            // 显示指定消息
            const messageEl = document.getElementById(elementId);
            document.getElementById(elementId.replace('message', 'text')).textContent = text;
            messageEl.classList.remove('hidden');
            
            // 3秒后自动隐藏成功消息
            if (elementId === 'success-message') {
                setTimeout(() => {
                    messageEl.classList.add('hidden');
                }, 3000);
            }
        }
        
        // 处理文件上传
        document.getElementById('file-upload').addEventListener('change', handleFileUpload);
        
        // 支持拖放上传
        const uploadContainer = document.getElementById('upload-container');
        uploadContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadContainer.classList.add('border-primary', 'bg-blue-50');
        });
        
        uploadContainer.addEventListener('dragleave', () => {
            uploadContainer.classList.remove('border-primary', 'bg-blue-50');
        });
        
        uploadContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadContainer.classList.remove('border-primary', 'bg-blue-50');
            
            if (e.dataTransfer.files.length) {
                document.getElementById('file-upload').files = e.dataTransfer.files;
                handleFileUpload(e);
            }
        });
        
        // 处理文件上传
        function handleFileUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            // 检查文件类型
            const fileExtension = file.name.split('.').pop().toLowerCase();
            if (!['xlsx', 'xls'].includes(fileExtension)) {
                showMessage('error-message', '请上传XLSX或XLS格式的文件');
                return;
            }
            
            // 显示进度条
            document.getElementById('upload-progress').classList.remove('hidden');
            document.getElementById('progress-bar').style.width = '20%';
            document.getElementById('progress-text').textContent = '正在解析文件...';
            
            try {
                if (fileExtension === 'csv') {
                    // 解析CSV
                    Papa.parse(file, {
                        header: true,
                        dynamicTyping: true,
                        complete: function(results) {
                            if (results.errors && results.errors.length > 0) {
                                throw new Error(`CSV解析错误: ${results.errors[0].message}`);
                            }
                            processDateTimeData(results.data);
                        },
                        error: function(error) {
                            throw new Error(`CSV解析错误: ${error.message}`);
                        }
                    });
                } else {
                    // 解析Excel文件
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            
                            // 获取第一个工作表
                            const firstSheetName = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[firstSheetName];
                            
                            // 转换为JSON
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                                header: 1,
                                raw: false,
                                dateNF: 'yyyy-mm-dd hh:mm:ss'
                            });
                            
                            // 如果没有数据
                            if (jsonData.length < 2) {
                                throw new Error('Excel文件中没有足够的数据');
                            }
                            
                            // 提取表头
                            const headers = jsonData[0].map(h => h.toString().trim());
                            
                            // 转换为对象数组
                            const formattedData = [];
                            for (let i = 1; i < jsonData.length; i++) {
                                const row = jsonData[i];
                                const rowObj = {};
                                
                                // 处理每一列
                                headers.forEach((header, index) => {
                                    let value = row[index];
                                    
                                    // 处理日期
                                    if (value instanceof Date) {
                                        rowObj[header] = value.toISOString().slice(0, 19).replace('T', ' ');
                                    } 
                                    // 处理数字
                                    else if (!isNaN(value)) {
                                        rowObj[header] = Number(value);
                                    } 
                                    // 其他值作为字符串
                                    else {
                                        rowObj[header] = value ? value.toString().trim() : '';
                                    }
                                });
                                
                                formattedData.push(rowObj);
                            }
                            
                            // 继续处理数据
                            processDateTimeData(formattedData);
                        } catch (error) {
                            showMessage('error-message', `Excel解析错误: ${error.message}`);
                            document.getElementById('upload-progress').classList.add('hidden');
                        }
                    };
                    
                    reader.onerror = function() {
                        throw new Error('文件读取错误');
                    };
                    
                    reader.readAsArrayBuffer(file);
                }
            } catch (error) {
                showMessage('error-message', error.message);
                document.getElementById('upload-progress').classList.add('hidden');
            }
        }
        
        // 处理包含日期时间和多时段数据
        function processDateTimeData(rawData) {
            try {
                document.getElementById('progress-bar').style.width = '30%';
                document.getElementById('progress-text').textContent = '正在处理数据格式...';
                
                // 验证数据
                if (!rawData || rawData.length === 0) {
                    throw new Error('没有找到有效数据');
                }
                
                // 自动检测列名
                const columns = Object.keys(rawData[0] || {});
                if (columns.length < 3) {
                    throw new Error('数据格式不正确，需要至少三列数据（日期时间、ASIN、销量排名）');
                }
                
                // 检测关键列
                let datetimeColumn, asinColumn, rankColumn;
                
                // 检测日期时间列
                datetimeColumn = columns.find(col => 
                    ['datetime', '日期时间', '时间', 'date', 'datetime'].some(keyword => 
                        col.toLowerCase().includes(keyword)
                    )
                );
                
                // 检测ASIN列
                asinColumn = columns.find(col => 
                    ['asin', '产品编号', '产品id'].some(keyword => 
                        col.toLowerCase().includes(keyword)
                    )
                );
                
                // 检测排名列
                rankColumn = columns.find(col => 
                    ['rank', '排名', '销量排名', 'sales rank'].some(keyword => 
                        col.toLowerCase().includes(keyword)
                    )
                );
                
                // 如果自动检测失败，使用位置推断并提示
                if (!datetimeColumn) {
                    datetimeColumn = columns[0];
                    showMessage('success-message', `自动使用第一列 "${datetimeColumn}" 作为日期时间列`);
                }
                if (!asinColumn) {
                    asinColumn = columns[1];
                    showMessage('success-message', `自动使用第二列 "${asinColumn}" 作为ASIN列`);
                }
                if (!rankColumn) {
                    rankColumn = columns[2];
                    showMessage('success-message', `自动使用第三列 "${rankColumn}" 作为销量排名列`);
                }
                
                // 按日期和ASIN分组，计算每日平均排名
                const dailyData = {}; // 结构: { "YYYY-MM-DD": { "ASIN1": [排名1, 排名2], ... }, ... }
                let validRows = 0;
                let invalidRows = 0;
                
                rawData.forEach(row => {
                    try {
                        // 解析日期时间（支持多种格式）
                        const dateValue = row[datetimeColumn];
                        const datetime = new Date(dateValue);
                        if (isNaN(datetime.getTime())) {
                            invalidRows++;
                            return;
                        }
                        
                        // 提取日期部分（YYYY-MM-DD）
                        const dateStr = `${datetime.getFullYear()}-${(datetime.getMonth() + 1).toString().padStart(2, '0')}-${datetime.getDate().toString().padStart(2, '0')}`;
                        
                        const asin = row[asinColumn];
                        const rank = Number(row[rankColumn]);
                        
                        if (!asin || asin.trim() === '' || isNaN(rank) || rank <= 0) {
                            invalidRows++;
                            return;
                        }
                        
                        // 初始化数据结构
                        if (!dailyData[dateStr]) {
                            dailyData[dateStr] = {};
                        }
                        if (!dailyData[dateStr][asin]) {
                            dailyData[dateStr][asin] = [];
                        }
                        
                        // 添加排名数据
                        dailyData[dateStr][asin].push(rank);
                        validRows++;
                    } catch (e) {
                        invalidRows++;
                    }
                });
                
                // 检查有效数据
                if (validRows === 0) {
                    throw new Error('没有找到有效数据，请检查数据格式');
                }
                
                // 显示数据处理信息
                showMessage('success-message', `成功处理 ${validRows} 行数据，跳过 ${invalidRows} 行无效数据`);
                
                // 提取唯一的日期和ASIN列表并排序
                const dates = Object.keys(dailyData).sort().map(d => new Date(d));
                const asinsSet = new Set();
                
                // 收集所有ASIN
                Object.values(dailyData).forEach(dateData => {
                    Object.keys(dateData).forEach(asin => {
                        asinsSet.add(asin);
                    });
                });
                
                const asins = Array.from(asinsSet);
                
                // 验证数据完整性
                if (dates.length === 0 || asins.length < 2) {
                    throw new Error(`数据不完整，找到 ${asins.length} 个ASIN和 ${dates.length} 天数据，至少需要2个ASIN和1天数据`);
                }
                
                document.getElementById('progress-bar').style.width = '50%';
                document.getElementById('progress-text').textContent = `正在处理 ${asins.length} 个ASIN的数据...`;
                
                // 创建日期到索引的映射
                const dateToIndex = new Map();
                dates.forEach((date, index) => {
                    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
                    dateToIndex.set(dateStr, index);
                });
                
                // 计算每日平均排名并构建分析数据结构
                const data = {};
                asins.forEach(asin => {
                    data[asin] = new Array(dates.length).fill(null);
                });
                
                // 填充每日平均排名
                Object.entries(dailyData).forEach(([dateStr, asinRanks]) => {
                    const dateIndex = dateToIndex.get(dateStr);
                    if (dateIndex === undefined) return;
                    
                    Object.entries(asinRanks).forEach(([asin, ranks]) => {
                        if (asins.includes(asin)) {
                            // 计算平均值
                            const avgRank = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
                            data[asin][dateIndex] = avgRank;
                        }
                    });
                });
                
                document.getElementById('progress-bar').style.width = '70%';
                document.getElementById('progress-text').textContent = '正在处理缺失数据...';
                
                // 处理缺失值（使用前后值的平均值填充）
                asins.forEach(asin => {
                    const values = data[asin];
                    for (let i = 0; i < values.length; i++) {
                        if (values[i] === null || isNaN(values[i])) {
                            // 查找前一个有效值
                            let prev = null;
                            for (let j = i - 1; j >= 0; j--) {
                                if (values[j] !== null && !isNaN(values[j])) {
                                    prev = values[j];
                                    break;
                                }
                            }
                            
                            // 查找后一个有效值
                            let next = null;
                            for (let j = i + 1; j < values.length; j++) {
                                if (values[j] !== null && !isNaN(values[j])) {
                                    next = values[j];
                                    break;
                                }
                            }
                            
                            // 填充缺失值
                            if (prev !== null && next !== null) {
                                values[i] = (prev + next) / 2;
                            } else if (prev !== null) {
                                values[i] = prev;
                            } else if (next !== null) {
                                values[i] = next;
                            } else {
                                // 如果整个系列都没有有效数据，移除这个ASIN
                                delete data[asin];
                                break;
                            }
                        }
                    }
                });
                
                // 更新ASIN列表（移除没有有效数据的ASIN）
                const validAsins = asins.filter(asin => data[asin] !== undefined);
                if (validAsins.length < 2) {
                    throw new Error(`有效ASIN数量不足（${validAsins.length}个），无法进行相关性分析`);
                }
                
                // 存储分析数据
                analysisData = {
                    dates,
                    asins: validAsins,
                    data
                };
                
                // 更新数据信息
                document.getElementById('data-stats').textContent = 
                    `时间范围: ${formatDate(dates[0])} 至 ${formatDate(dates[dates.length-1])}, 共 ${validAsins.length} 个有效ASIN, ${dates.length} 天数据`;
                document.getElementById('data-info').classList.remove('hidden');
                
                // 启用滑块
                document.getElementById('correlation-threshold').disabled = false;
                
                // 执行分析
                performAnalysis();
                
                // 更新进度
                document.getElementById('progress-bar').style.width = '100%';
                document.getElementById('progress-text').textContent = '分析完成';
                setTimeout(() => {
                    document.getElementById('upload-progress').classList.add('hidden');
                }, 1000);
                
            } catch (error) {
                showMessage('error-message', error.message);
                document.getElementById('upload-progress').classList.add('hidden');
            }
        }
        
        // 执行相关性分析
        function performAnalysis() {
            if (!analysisData) return;
            
            const { dates, asins, data } = analysisData;
            
            // 计算相关性矩阵
            correlationMatrix = calculateCorrelationMatrix(data, asins);
            
            // 更新阈值显示
            document.getElementById('threshold-value').textContent = currentThreshold.toFixed(2);
            document.getElementById('positive-threshold-display').textContent = currentThreshold.toFixed(2);
            document.getElementById('negative-threshold-display').textContent = (-currentThreshold).toFixed(2);
            document.getElementById('heatmap-threshold-display').textContent = currentThreshold.toFixed(2);
            
            // 渲染各个组件
            renderHeatmap(correlationMatrix, asins);
            renderCorrelationPairs(correlationMatrix, asins);
            renderTrendsChart(dates, data, asins);
            updateStatistics(correlationMatrix);
        }
        
        // 格式化日期
        function formatDate(date) {
            return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        }
        
        // 计算皮尔逊相关系数
        function pearsonCorrelation(x, y) {
            if (x.length !== y.length) throw new Error("数组长度必须相等");
            
            let n = 0;
            let sumX = 0, sumY = 0, sumXY = 0;
            let sumX2 = 0, sumY2 = 0;
            
            for (let i = 0; i < x.length; i++) {
                // 跳过NaN值
                if (isNaN(x[i]) || isNaN(y[i])) continue;
                
                n++;
                sumX += x[i];
                sumY += y[i];
                sumXY += x[i] * y[i];
                sumX2 += x[i] * x[i];
                sumY2 += y[i] * y[i];
            }
            
            // 如果没有足够的数据点，返回0
            if (n < 2) return 0;
            
            const numerator = n * sumXY - sumX * sumY;
            const denominator = Math.sqrt(
                (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
            );
            
            return denominator === 0 ? 0 : numerator / denominator;
        }
        
        // 计算相关性矩阵
        function calculateCorrelationMatrix(data, asins) {
            const matrix = [];
            
            for (let i = 0; i < asins.length; i++) {
                const row = [];
                for (let j = 0; j < asins.length; j++) {
                    if (i === j) {
                        row.push(1); // 自身相关性为1
                    } else {
                        row.push(pearsonCorrelation(data[asins[i]], data[asins[j]]));
                    }
                }
                matrix.push(row);
            }
            
            return matrix;
        }
        
        // 渲染相关性热力图 - 根据当前阈值显示
        function renderHeatmap(matrix, asins) {
            const heatmapContainer = document.getElementById('correlation-heatmap');
            heatmapContainer.innerHTML = '';
            
            // 创建表头
            const headerRow = document.createElement('div');
            headerRow.className = 'flex border-b border-gray-200';
            headerRow.innerHTML = '<div class="w-24 p-2 font-medium"></div>'; // 空白单元格
            
            asins.forEach(asin => {
                headerRow.innerHTML += `
                    <div class="min-w-[80px] p-2 font-medium border-r border-gray-200">
                        ${asin}
                    </div>
                `;
            });
            heatmapContainer.appendChild(headerRow);
            
            // 创建数据行
            matrix.forEach((row, i) => {
                const dataRow = document.createElement('div');
                dataRow.className = 'flex border-b border-gray-200 hover:bg-gray-50';
                
                // 行标题
                dataRow.innerHTML = `
                    <div class="w-24 p-2 font-medium border-r border-gray-200 bg-gray-50">
                        ${asins[i]}
                    </div>
                `;
                
                // 数据单元格 - 根据当前阈值显示不同样式
                row.forEach((value, j) => {
                    let cellClass = 'correlation-cell min-w-[80px] border-r border-gray-200';
                    
                    // 如果相关系数绝对值小于当前阈值，隐藏显示
                    if (Math.abs(value) < currentThreshold) {
                        cellClass += ' correlation-hidden';
                    } 
                    // 否则根据相关系数设置颜色
                    else if (value > 0) {
                        if (value > 0.7) {
                            cellClass += ' correlation-high-positive';
                        } else {
                            cellClass += ' correlation-positive';
                        }
                    } else {
                        if (value < -0.7) {
                            cellClass += ' correlation-high-negative';
                        } else {
                            cellClass += ' correlation-negative';
                        }
                    }
                    
                    dataRow.innerHTML += `
                        <div class="${cellClass}" title="${asins[i]} 与 ${asins[j]}: ${value.toFixed(2)}">
                            ${Math.abs(value) >= currentThreshold ? value.toFixed(2) : '-'}
                        </div>
                    `;
                });
                
                heatmapContainer.appendChild(dataRow);
            });
        }
        
        // 渲染相关性对表格 - 根据当前阈值筛选
        function renderCorrelationPairs(matrix, asins) {
            // 正相关性容器
            const positiveContainer = document.getElementById('positive-pairs');
            // 负相关性容器
            const negativeContainer = document.getElementById('negative-pairs');
            
            // 清空容器
            positiveContainer.innerHTML = '';
            negativeContainer.innerHTML = '';
            
            const positivePairs = [];
            const negativePairs = [];
            
            // 只检查上三角（避免重复对）
            for (let i = 0; i < asins.length; i++) {
                for (let j = i + 1; j < asins.length; j++) {
                    const corr = matrix[i][j];
                    if (corr >= currentThreshold) {
                        // 正相关，且达到当前阈值
                        positivePairs.push({
                            asin1: asins[i],
                            asin2: asins[j],
                            correlation: corr,
                            strength: getCorrelationStrength(corr)
                        });
                    } else if (corr <= -currentThreshold) {
                        // 负相关，且达到当前阈值
                        negativePairs.push({
                            asin1: asins[i],
                            asin2: asins[j],
                            correlation: corr,
                            strength: getCorrelationStrength(corr)
                        });
                    }
                }
            }
            
            // 处理正相关性结果
            if (positivePairs.length === 0) {
                positiveContainer.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-4 text-center text-gray-500">没有发现相关系数 ≥ ${currentThreshold.toFixed(2)} 的正相关ASIN对</td>
                    </tr>
                `;
            } else {
                // 按相关系数排序（从高到低）
                positivePairs.sort((a, b) => b.correlation - a.correlation);
                
                positivePairs.forEach(pair => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-100 hover:bg-red-50';
                    
                    row.innerHTML = `
                        <td class="py-2 px-4">${pair.asin1}</td>
                        <td class="py-2 px-4">${pair.asin2}</td>
                        <td class="py-2 px-4 font-medium text-positive">${pair.correlation.toFixed(2)}</td>
                        <td class="py-2 px-4">${pair.strength}</td>
                    `;
                    
                    positiveContainer.appendChild(row);
                });
            }
            
            // 处理负相关性结果
            if (negativePairs.length === 0) {
                negativeContainer.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-4 text-center text-gray-500">没有发现相关系数 ≤ ${(-currentThreshold).toFixed(2)} 的负相关ASIN对</td>
                    </tr>
                `;
            } else {
                // 按相关系数绝对值排序（从高到低）
                negativePairs.sort((a, b) => a.correlation - b.correlation);
                
                negativePairs.forEach(pair => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-100 hover:bg-blue-50';
                    
                    row.innerHTML = `
                        <td class="py-2 px-4">${pair.asin1}</td>
                        <td class="py-2 px-4">${pair.asin2}</td>
                        <td class="py-2 px-4 font-medium text-negative">${pair.correlation.toFixed(2)}</td>
                        <td class="py-2 px-4">${pair.strength}</td>
                    `;
                    
                    negativeContainer.appendChild(row);
                });
            }
        }
        
        // 获取相关强度描述
        function getCorrelationStrength(value) {
            const absValue = Math.abs(value);
            if (absValue >= 0.9) {
                return "极强相关";
            } else if (absValue >= 0.7) {
                return "强相关";
            } else if (absValue >= 0.5) {
                return "中等相关";
            } else if (absValue >= 0.3) {
                return "弱相关";
            } else {
                return "极弱相关";
            }
        }
        
        // 渲染趋势图
        function renderTrendsChart(dates, data, asins) {
            // 格式化日期
            const dateLabels = dates.map(date => formatDate(date));
            
            // 最多显示6个ASIN的数据，避免图表过于拥挤
            const displayAsins = asins.slice(0, 6);
            
            // 为每个ASIN准备数据集
            const datasets = displayAsins.map((asin, index) => {
                // 使用不同的颜色
                const colors = [
                    'rgba(59, 130, 246, 0.7)', // 蓝色
                    'rgba(16, 185, 129, 0.7)', // 绿色
                    'rgba(239, 68, 68, 0.7)',  // 红色
                    'rgba(139, 92, 246, 0.7)', // 紫色
                    'rgba(245, 158, 11, 0.7)', // 橙色
                    'rgba(0, 179, 255, 0.7)'   // 亮蓝
                ];
                
                return {
                    label: asin,
                    data: data[asin],
                    borderColor: colors[index],
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 2
                };
            });
            
            // 更新图表数据
            trendsChart.data.labels = dateLabels;
            trendsChart.data.datasets = datasets;
            trendsChart.update();
        }
        
        // 更新统计信息 - 根据当前阈值
        function updateStatistics(matrix) {
            // 提取上三角非对角线元素
            const flatCorr = [];
            for (let i = 0; i < matrix.length; i++) {
                for (let j = i + 1; j < matrix.length; j++) {
                    flatCorr.push(matrix[i][j]);
                }
            }
            
            if (flatCorr.length === 0) return;
            
            // 计算统计值
            const avgCorrelation = flatCorr.reduce((sum, val) => sum + val, 0) / flatCorr.length;
            const positiveRatio = flatCorr.filter(val => val > 0).length / flatCorr.length;
            const strongPositiveRatio = flatCorr.filter(val => val >= currentThreshold).length / flatCorr.length;
            const strongNegativeRatio = flatCorr.filter(val => val <= -currentThreshold).length / flatCorr.length;
            
            // 更新DOM
            document.getElementById('avg-correlation').textContent = avgCorrelation.toFixed(2);
            document.getElementById('positive-ratio').textContent = (positiveRatio * 100).toFixed(2) + '%';
            document.getElementById('strong-positive-ratio').textContent = (strongPositiveRatio * 100).toFixed(2) + '%';
            document.getElementById('strong-negative-ratio').textContent = (strongNegativeRatio * 100).toFixed(2) + '%';
        }
        
        // 页面加载完成后初始化
        window.addEventListener('DOMContentLoaded', () => {
            initChart();
            initSlider();
        });