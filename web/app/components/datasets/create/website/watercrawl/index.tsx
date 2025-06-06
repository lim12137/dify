'use client'
import type { FC } from 'react'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import UrlInput from '../base/url-input'
import OptionsWrap from '../base/options-wrap'
import CrawledResult from '../base/crawled-result'
import Crawling from '../base/crawling'
import ErrorMessage from '../base/error-message'
import Header from './header'
import Options from './options'
import { useModalContext } from '@/context/modal-context'
import type { CrawlOptions, CrawlResultItem } from '@/models/datasets'
import Toast from '@/app/components/base/toast'
import { checkWatercrawlTaskStatus, createWatercrawlTask } from '@/service/datasets'
import { sleep } from '@/utils'

const ERROR_I18N_PREFIX = 'common.errorMsg'
const I18N_PREFIX = 'datasetCreation.stepOne.website'

type Props = {
  onPreview: (payload: CrawlResultItem) => void
  checkedCrawlResult: CrawlResultItem[]
  onCheckedCrawlResultChange: (payload: CrawlResultItem[]) => void
  onJobIdChange: (jobId: string) => void
  crawlOptions: CrawlOptions
  onCrawlOptionsChange: (payload: CrawlOptions) => void
}

enum Step {
  init = 'init',
  running = 'running',
  finished = 'finished',
}

const WaterCrawl: FC<Props> = ({
  onPreview,
  checkedCrawlResult,
  onCheckedCrawlResultChange,
  onJobIdChange,
  crawlOptions,
  onCrawlOptionsChange,
}) => {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>(Step.init)
  const [controlFoldOptions, setControlFoldOptions] = useState<number>(0)
  useEffect(() => {
    if (step !== Step.init)
      setControlFoldOptions(Date.now())
  }, [step])
  const { setShowAccountSettingModal } = useModalContext()
  const handleSetting = useCallback(() => {
    setShowAccountSettingModal({
      payload: 'data-source',
    })
  }, [setShowAccountSettingModal])

  const checkValid = useCallback((url: string) => {
    let errorMsg = ''
    if (!url) {
      errorMsg = t(`${ERROR_I18N_PREFIX}.fieldRequired`, {
        field: 'url',
      })
    }

    if (!errorMsg && !((url.startsWith('http://') || url.startsWith('https://'))))
      errorMsg = t(`${ERROR_I18N_PREFIX}.urlError`)

    if (!errorMsg && (crawlOptions.limit === null || crawlOptions.limit === undefined || crawlOptions.limit === '')) {
      errorMsg = t(`${ERROR_I18N_PREFIX}.fieldRequired`, {
        field: t(`${I18N_PREFIX}.limit`),
      })
    }

    return {
      isValid: !errorMsg,
      errorMsg,
    }
  }, [crawlOptions, t])

  const isInit = step === Step.init
  const isCrawlFinished = step === Step.finished
  const isRunning = step === Step.running
  const [crawlResult, setCrawlResult] = useState<{
    current: number
    total: number
    data: CrawlResultItem[]
    time_consuming: number | string
  } | undefined>(undefined)
  const [crawlErrorMessage, setCrawlErrorMessage] = useState('')
  const showError = isCrawlFinished && crawlErrorMessage

  const waitForCrawlFinished = useCallback(async (jobId: string): Promise<any> => {
    try {
      const res = await checkWatercrawlTaskStatus(jobId) as any
      if (res.status === 'completed') {
        return {
          isError: false,
          data: {
            ...res,
            total: Math.min(res.total, Number.parseFloat(crawlOptions.limit as string)),
          },
        }
      }
      if (res.status === 'error' || !res.status) {
        // can't get the error message from the watercrawl api
        return {
          isError: true,
          errorMessage: res.message,
          data: {
            data: [],
          },
        }
      }
      // update the progress
      setCrawlResult({
        ...res,
        total: Math.min(res.total, Number.parseFloat(crawlOptions.limit as string)),
      })
      onCheckedCrawlResultChange(res.data || []) // default select the crawl result
      await sleep(2500)
      return await waitForCrawlFinished(jobId)
    }
    catch (e: any) {
      const errorBody = await e.json()
      return {
        isError: true,
        errorMessage: errorBody.message,
        data: {
          data: [],
        },
      }
    }
  }, [crawlOptions.limit])

  const handleRun = useCallback(async (url: string) => {
    const { isValid, errorMsg } = checkValid(url)
    if (!isValid) {
      Toast.notify({
        message: errorMsg!,
        type: 'error',
      })
      return
    }
    setStep(Step.running)
    try {
      const passToServerCrawlOptions: any = {
        ...crawlOptions,
      }
      if (crawlOptions.max_depth === '')
        delete passToServerCrawlOptions.max_depth

      const res = await createWatercrawlTask({
        url,
        options: passToServerCrawlOptions,
      }) as any
      const jobId = res.job_id
      onJobIdChange(jobId)
      const { isError, data, errorMessage } = await waitForCrawlFinished(jobId)
      if (isError) {
        setCrawlErrorMessage(errorMessage || t(`${I18N_PREFIX}.unknownError`))
      }
      else {
        setCrawlResult(data)
        onCheckedCrawlResultChange(data.data || []) // default select the crawl result
        setCrawlErrorMessage('')
      }
    }
    catch (e) {
      setCrawlErrorMessage(t(`${I18N_PREFIX}.unknownError`)!)
      console.log(e)
    }
    finally {
      setStep(Step.finished)
    }
  }, [checkValid, crawlOptions, onJobIdChange, t, waitForCrawlFinished])

  return (
    <div>
      <Header onSetting={handleSetting} />
      <div className='mt-2 rounded-xl border border-components-panel-border bg-background-default-subtle p-4 pb-0'>
        <UrlInput onRun={handleRun} isRunning={isRunning} />
        <OptionsWrap
          className='mt-4'
          controlFoldOptions={controlFoldOptions}
        >
          <Options className='mt-2' payload={crawlOptions} onChange={onCrawlOptionsChange} />
        </OptionsWrap>

        {!isInit && (
          <div className='relative left-[-16px] mt-3 w-[calc(100%_+_32px)] rounded-b-xl'>
            {isRunning
              && <Crawling
                className='mt-2'
                crawledNum={crawlResult?.current || 0}
                totalNum={crawlResult?.total || Number.parseFloat(crawlOptions.limit as string) || 0}
              />}
            {showError && (
              <ErrorMessage className='rounded-b-xl' title={t(`${I18N_PREFIX}.exceptionErrorTitle`)} errorMsg={crawlErrorMessage} />
            )}
            {isCrawlFinished && !showError
              && <CrawledResult
                className='mb-2'
                list={crawlResult?.data || []}
                checkedList={checkedCrawlResult}
                onSelectedChange={onCheckedCrawlResultChange}
                onPreview={onPreview}
                usedTime={Number.parseFloat(crawlResult?.time_consuming as string) || 0}
              />
            }
          </div>
        )}
      </div>
    </div>
  )
}
export default React.memo(WaterCrawl)
